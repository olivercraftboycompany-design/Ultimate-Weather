// NEXUS Ultimate push sender. Runs in GitHub Actions (see .github/workflows/weather-push.yml).
// One quick pass ("check" job), then a watch loop (LOOP_MINUTES) that checks every minute and hands off to the next run.
// Reads sealed subscriptions from ntfy.sh, checks the weather, sends Web Push (VAPID) notifications.
// State (subscriptions + what was already sent) is encrypted and kept in the Actions cache, never in the repo.
import webpush from 'web-push';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const env = process.env;
const TOPIC = env.NTFY_TOPIC;
const STATE_FILE = path.join(env.STATE_DIR || '.state', 'state.bin');
let FORCE_TEST = env.FORCE_TEST === 'true';
const DRY = env.DRY_RUN === 'true';
// NOW_OVERRIDE (local testing only) shifts the clock; the loop keeps ticking from there
const NOW_SHIFT = env.NOW_OVERRIDE ? Date.parse(env.NOW_OVERRIDE) - Date.now() : 0;
let NOW = Date.now() + NOW_SHIFT;
const LOOP_MINUTES = +env.LOOP_MINUTES || 0;
const TICK_MS = (+env.TICK_SECONDS || 60) * 1000;
const UA = 'NEXUS-Ultimate-Weather (github.com/olivercraftboycompany-design/Ultimate-Weather)';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

for (const k of ['VAPID_PUBLIC', 'VAPID_PRIVATE', 'BOX_PRIVATE', 'NTFY_TOPIC']) if (!env[k]) { console.error('Missing ' + k); process.exit(1); }
webpush.setVapidDetails('mailto:noreply@github.com', env.VAPID_PUBLIC, env.VAPID_PRIVATE);

/* ---------- crypto: open sealed messages, encrypt state at rest ---------- */
const b64u = s => Buffer.from(s, 'base64url');
const boxPriv = b64u(env.BOX_PRIVATE);
export function open(sealed) {
  const [v, eph, iv, ct] = String(sealed).trim().split('.');
  if ((v !== 'uw1' && v !== 'uw2') || !ct) throw new Error('not a uw1/uw2 message');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(boxPriv);
  const shared = ecdh.computeSecret(b64u(eph));
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('uw-box-v1'), 32));
  const data = b64u(ct), tag = data.subarray(data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, b64u(iv)); d.setAuthTag(tag);
  let plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  if (v === 'uw2') plain = zlib.inflateRawSync(plain); // big settings (lots of custom alerts) arrive deflated
  return JSON.parse(plain.toString('utf8'));
}
const stateKey = crypto.createHash('sha256').update(Buffer.concat([boxPriv, Buffer.from('uw-state-v1')])).digest();
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE); const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28);
    const d = crypto.createDecipheriv('aes-256-gcm', stateKey, iv); d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) { log('no previous state (' + (e.code || e.message) + ')'); return {}; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', stateKey, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(s)), c.final()]);
  fs.writeFileSync(STATE_FILE, Buffer.concat([iv, c.getAuthTag(), ct]));
}

/* ---------- helpers ---------- */
async function getJSON(url, opts = {}, ms = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); if (!r.ok) throw new Error(r.status + ' ' + url.split('?')[0]); return await r.json(); }
  finally { clearTimeout(t); }
}
const idOf = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 12);
const WXT = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Foggy',48:'Foggy',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Showers',81:'Showers',82:'Heavy showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorms',96:'Storms with hail',99:'Storms with hail'};
const EMO = c => c === 0 ? '☀️' : c <= 2 ? '⛅' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : c <= 86 ? '🌨️' : '⛈️';
const hhmm = iso => { let [h, m] = iso.slice(11, 16).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };

/* ---------- 1) read new messages from ntfy ---------- */
async function readInbox(state, verbose = true) {
  const since = state.since || 'all';
  let txt = '';
  try { const r = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=${encodeURIComponent(since)}`); txt = r.ok ? await r.text() : ''; if (!r.ok) log('ntfy', r.status); }
  catch (e) { log('ntfy read failed', e.message); return []; }
  const msgs = txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(m => m && m.event === 'message');
  const out = [];
  for (const m of msgs) {
    state.since = m.id;
    try { const p = open(m.message); p._at = m.time * 1000; out.push(p); } catch (e) { log('skipped a message we could not open'); }
  }
  if (verbose || msgs.length) log(`ntfy: ${msgs.length} new message(s), ${out.length} readable`);
  return out;
}

/* ---------- 2) push one notification ---------- */
async function push(state, sid, n, opts = {}) {
  const s = state.subs[sid]; if (!s) return false;
  const body = JSON.stringify({ ...n, ts: NOW });
  if (DRY) { log('[dry] would push to', sid, body); return true; }
  try {
    const r = await webpush.sendNotification(s.sub, body, { TTL: opts.ttl ?? 3600, urgency: opts.urgency || 'normal', topic: (n.tag || 'nexus').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
    log(`pushed "${n.title}" to ${sid} → ${r.statusCode}`); s.lastOk = NOW; s.fails = 0; return true;
  } catch (e) {
    log(`push to ${sid} failed: ${e.statusCode || ''} ${e.body || e.message}`);
    if (e.statusCode === 404 || e.statusCode === 410) { log('subscription expired, removing', sid); delete state.subs[sid]; }
    else { s.fails = (s.fails || 0) + 1; }
    return false;
  }
}

/* ---------- 3) weather checks per subscriber ---------- */
async function checkWeather(state, sid) {
  const s = state.subs[sid], p = s.prefs || {}, F = s.unit !== 'C', deg = '°';
  const sent = s.sent || (s.sent = { alerts: {}, morning: null, temp: null, rainAt: 0, dryAt: 0 });
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&timezone=auto&forecast_days=8`
    + '&current=temperature_2m,apparent_temperature,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,dew_point_2m'
    + '&minutely_15=precipitation,weather_code&past_minutely_15=1&forecast_minutely_15=6'
    + '&hourly=precipitation_probability,temperature_2m,weather_code,apparent_temperature,wind_speed_10m,wind_gusts_10m,uv_index,relative_humidity_2m,dew_point_2m,cloud_cover,precipitation,snowfall'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max,uv_index_max,snowfall_sum'
    + (F ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '');
  let W;
  try { W = await getJSON(u); } catch (e) { log('open-meteo failed', e.message); return; }
  const off = W.utc_offset_seconds * 1000, local = new Date(NOW + off);
  s.off = off;
  const today = local.toISOString().slice(0, 10), mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  const nowISO = local.toISOString().slice(0, 16);
  const D = W.daily, ti = Math.max(0, D.time.indexOf(today)), c = W.current;
  const place = s.name ? ` in ${s.name}` : '';
  log(`  weather read: ${Math.round(c.temperature_2m)}${deg}, ${WXT[c.weather_code] || c.weather_code}; prefs alerts=${p.alerts !== false} rain=${p.rain !== false} morning=${p.morning !== false} temp=${p.temp !== false} every=${p.every || 15}min`);

  // test request from the app
  const customTest = typeof s.testPending === 'string' ? s.testPending : null;
  if ((s.testPending && !customTest) || FORCE_TEST) {
    await push(state, sid, { title: '✅ Push from the weather server works!', body: `Right now${place}: ${Math.round(c.temperature_2m)}${deg} and ${(WXT[c.weather_code] || '').toLowerCase()}. You're all set.`, tag: 'nexus-test', url: './#notify' }, { ttl: 900 });
    s.testPending = false;
  }

  // NWS alerts (US only)
  if (p.alerts !== false) {
    try {
      const A = await getJSON(`https://api.weather.gov/alerts/active?point=${s.lat},${s.lon}`, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } }, 12000);
      log(`  NWS alerts: ${(A.features || []).length} active for this spot${(A.features || []).length ? ' (' + A.features.map(f => f.properties.event).join(', ') + ')' : ''}`);
      for (const f of A.features || []) {
        const a = f.properties; if (a.status !== 'Actual' || a.messageType === 'Cancel') continue;
        const id = a.id || f.id; if (sent.alerts[id]) continue;
        const refs = (a.references || []).map(r => r.identifier);
        const already = refs.some(r => sent.alerts[r]);
        const exp = Date.parse(a.ends || a.expires || '') || NOW + 864e5;
        sent.alerts[id] = exp;
        if (already) { log('alert update of one already sent, skipping', a.event); continue; }
        const major = /warning/i.test(a.event) || ['Extreme', 'Severe'].includes(a.severity);
        if (!major && a.severity !== 'Moderate' && !/watch|advisory/i.test(a.event)) continue;
        const until = a.ends || a.expires; const untilTxt = until ? ' until ' + hhmm(new Date(Date.parse(until) + off).toISOString()) : '';
        const icon = /tornado/i.test(a.event) ? '🌪️' : /thunder|storm/i.test(a.event) ? '⛈️' : /flood/i.test(a.event) ? '🌊' : /winter|snow|ice|blizzard|freez|frost/i.test(a.event) ? '❄️' : /heat/i.test(a.event) ? '🔥' : /wind/i.test(a.event) ? '💨' : '⚠️';
        await push(state, sid, { title: `${icon} ${a.event}${untilTxt}`, body: (a.headline || a.description || '').replace(/\s+/g, ' ').slice(0, 230), tag: 'nws-' + id.slice(-24), url: './', sticky: major }, { urgency: major ? 'high' : 'normal', ttl: Math.max(600, Math.round((exp - NOW) / 1000)) });
      }
      for (const [k, exp] of Object.entries(sent.alerts)) if (exp < NOW - 2 * 864e5) delete sent.alerts[k];
    } catch (e) { log('NWS alerts skipped:', e.message); }
  }

  // rain or snow starting within the next hour
  if (p.rain !== false && W.minutely_15) {
    const M = W.minutely_15, thr = F ? 0.004 : 0.1;
    let i0 = M.time.findIndex(t => t > nowISO) - 1; if (i0 < 0) i0 = 0;
    const wetNow = (M.precipitation[i0] || 0) >= thr || (c.precipitation || 0) >= thr;
    if (wetNow) sent.dryAt = 0; else if (!sent.dryAt) sent.dryAt = NOW;
    let hit = -1; for (let k = i0 + 1; k <= i0 + 4 && k < M.time.length; k++) if ((M.precipitation[k] || 0) >= thr) { hit = k; break; }
    const hi = W.hourly.time.findIndex(t => t.slice(0, 13) === nowISO.slice(0, 13));
    const pNext = hi >= 0 ? Math.max(W.hourly.precipitation_probability[hi + 1] || 0, W.hourly.precipitation_probability[hi] || 0) : 0;
    log(`  rain next hour: ${wetNow ? 'already wet now' : hit >= 0 ? 'starts around ' + M.time[hit].slice(11) : 'none expected'} (hourly chance ${pNext}%)`);
    const dryLongEnough = sent.dryAt && NOW - sent.dryAt >= 45 * 60000;
    const cooled = NOW - (sent.rainAt || 0) > 3 * 3600000;
    if (!wetNow && hit >= 0 && (pNext >= 30 || (M.precipitation[hit] || 0) >= thr * 3) && cooled && (dryLongEnough || !sent.rainAt)) {
      const code = M.weather_code[hit] || 61, snow = code >= 71 && code <= 86, word = snow ? 'Snow' : (code >= 95 ? 'Storms' : 'Rain');
      const inMin = Math.max(5, Math.round((Date.parse(M.time[hit] + 'Z') - off - NOW) / 60000));
      const total = M.precipitation.slice(hit, hit + 4).reduce((a, b) => a + (b || 0), 0);
      await push(state, sid, { title: `${snow ? '🌨️' : code >= 95 ? '⛈️' : '🌧️'} ${word} starting in ~${inMin} min${place}`, body: `Around ${hhmm(M.time[hit])}. ${pNext ? pNext + '% chance this hour. ' : ''}${total >= (F ? 0.1 : 2.5) ? 'Could be heavy. ' : ''}Grab a jacket.`, tag: 'nexus-rain', url: './#rain' }, { urgency: 'high', ttl: 1800 });
      sent.rainAt = NOW;
    }
  }

  // morning summary
  if (p.morning !== false) {
    const [mh, mm] = (p.morningTime || '06:30').split(':').map(Number), target = mh * 60 + mm;
    const mDue = sent.morning !== today && mins >= target && mins <= target + 150;
    log(`  morning summary: on, target ${p.morningTime || '06:30'}, local ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}, sent today: ${sent.morning === today ? 'yes' : 'no'} → ${mDue ? 'SEND' : 'not now'}`);
    if (mDue) {
      const late = mins - target > 20;
      const hi = Math.round(D.temperature_2m_max[ti]), lo = Math.round(D.temperature_2m_min[ti]);
      const H = W.hourly, dayIdx = H.time.map((t, k) => [t, k]).filter(([t]) => t.startsWith(today) && +t.slice(11, 13) >= 6 && +t.slice(11, 13) <= 22);
      const wet = dayIdx.filter(([, k]) => (H.precipitation_probability[k] || 0) >= 40);
      let note;
      if (wet.length) { const peak = wet.reduce((a, b) => (H.precipitation_probability[b[1]] > H.precipitation_probability[a[1]] ? b : a)); note = `${H.precipitation_probability[peak[1]]}% chance of ${H.weather_code[peak[1]] >= 71 && H.weather_code[peak[1]] <= 86 ? 'snow' : 'rain'} around ${hhmm(peak[0])}, bring an umbrella ☔`; }
      else note = (D.precipitation_probability_max[ti] || 0) >= 20 ? `Low rain chance (${D.precipitation_probability_max[ti]}%).` : 'No rain expected.';
      // the daily code can say "rain" for a stray overnight drizzle; if no daytime hour is wet, describe the day by its most common daytime sky
      let dcode = D.weather_code[ti];
      if (!wet.length && dcode >= 51 && dayIdx.length) { const cnt = {}; for (const [, k] of dayIdx) cnt[H.weather_code[k]] = (cnt[H.weather_code[k]] || 0) + 1; dcode = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; }
      const feels = Math.round(c.apparent_temperature);
      const wear = F ? (feels < 32 ? 'Big coat weather 🧥' : feels < 50 ? 'Jacket weather 🧥' : feels < 65 ? 'Hoodie weather' : feels < 80 ? 'T-shirt weather 👕' : 'Hot one, stay cool 🥵') : (feels < 0 ? 'Big coat weather 🧥' : feels < 10 ? 'Jacket weather 🧥' : feels < 18 ? 'Hoodie weather' : feels < 27 ? 'T-shirt weather 👕' : 'Hot one, stay cool 🥵');
      await push(state, sid, { title: `${EMO(dcode)} ${late ? 'Morning summary (sorry it\'s late!)' : 'Good morning!'} High ${hi}${deg} · Low ${lo}${deg}`, body: `${WXT[dcode] || ''} today${place}. ${note} It's ${Math.round(c.temperature_2m)}${deg} now (feels ${feels}${deg}). ${wear}.`, tag: 'nexus-morning', url: './' }, { ttl: 3 * 3600 });
      sent.morning = today;
    }
  } else log('  morning summary: off in settings');

  // freeze or big temperature drop tomorrow (evening heads-up)
  if (p.temp !== false && sent.temp !== today && mins >= 15 * 60 && mins <= 22 * 60 && D.time[ti + 1]) {
    const tMinTom = D.temperature_2m_min[ti + 1], tMaxTom = D.temperature_2m_max[ti + 1], tMaxToday = D.temperature_2m_max[ti];
    const freeze = F ? 32 : 0, drop = F ? 15 : 8;
    let n = null;
    if (tMinTom <= freeze && D.temperature_2m_min[ti] > freeze) n = { title: `🥶 Freeze tonight: low ${Math.round(tMinTom)}${deg}`, body: `First freeze in a bit${place}. Cover plants, bring pets in, and grab a real coat tomorrow.` };
    else if (tMinTom <= freeze - (F ? 8 : 4)) n = { title: `🥶 Hard freeze: low ${Math.round(tMinTom)}${deg}`, body: `Bundle up tomorrow morning${place}.` };
    else if (tMaxToday - tMaxTom >= drop) n = { title: `📉 Big cool-down tomorrow: ${Math.round(tMaxTom)}${deg}`, body: `That's ${Math.round(tMaxToday - tMaxTom)}${deg} colder than today's high of ${Math.round(tMaxToday)}${deg}. Low ${Math.round(tMinTom)}${deg}. Plan a jacket.` };
    if (n) { await push(state, sid, { ...n, tag: 'nexus-temp', url: './' }, { ttl: 6 * 3600 }); sent.temp = today; }
  }

  // the person's own alerts ("My alerts" in the app)
  try { await customAlerts(state, sid, W, { today, mins, place, customTest }); }
  catch (e) { log('  my alerts failed:', e.message); }
  if (customTest) s.testPending = false;
}


/* ---------- 4) "My alerts": the person's own alerts from the app ---------- */
// alert shape (compact, set in the app): { id, n: name, e: emoji, on, k: 'c' condition | 's' scheduled, u: unit it was written in ('F'|'C'), msg,
//   condition: c: [{ m: metric, o: 'gt'|'lt'|'btw', v, v2 }], w: 'now'|'h3'|'h6'|'h12'|'today'|'tom', r: 'day'|'flip', h: ['07:00','22:00']
//   scheduled: t: 'HH:MM', d: [0-6] (0 = Sunday), s: 'now'|'today'|'tonight'|'tom'|'3d'|'wknd'|'msg' }
const MET = {
  temp: { h: 'temperature_2m', c: 'temperature_2m', k: 't', lbl: 'Temp' },
  feels: { h: 'apparent_temperature', c: 'apparent_temperature', k: 't', lbl: 'Feels like' },
  wind: { h: 'wind_speed_10m', c: 'wind_speed_10m', k: 'w', lbl: 'Wind' },
  gust: { h: 'wind_gusts_10m', c: 'wind_gusts_10m', k: 'w', lbl: 'Gusts' },
  rain: { h: 'precipitation_probability', k: '%', lbl: 'Rain chance' },
  precip: { h: 'precipitation', k: 'p', sum: true, lbl: 'Rain' },
  snow: { h: 'snowfall', k: 's', sum: true, lbl: 'Snow' },
  uv: { h: 'uv_index', k: 'uv', lbl: 'UV index' },
  hum: { h: 'relative_humidity_2m', c: 'relative_humidity_2m', k: '%', lbl: 'Humidity' },
  dew: { h: 'dew_point_2m', c: 'dew_point_2m', k: 't', lbl: 'Dew point' },
  cloud: { h: 'cloud_cover', c: 'cloud_cover', k: '%', lbl: 'Clouds' },
  aqi: { aq: true, k: 'aqi', lbl: 'Air quality (AQI)' }
};
// "below" on these means the whole window stays under the line (a dry, calm or clear stretch); on temperatures it means it drops below
const STAYS = new Set(['rain', 'wind', 'gust', 'uv', 'aqi', 'cloud']);
const WIN = { now: 'right now', h3: 'in the next 3 hours', h6: 'in the next 6 hours', h12: 'in the next 12 hours', today: 'later today', tom: 'tomorrow' };
const unitTxt = (k, F) => k === 't' ? '°' : k === 'w' ? (F ? ' mph' : ' km/h') : k === 'p' ? (F ? ' in' : ' mm') : k === 's' ? (F ? ' in' : ' cm') : k === '%' ? '%' : '';
const dispV = (k, v) => v == null || !isFinite(v) ? '?' : (k === 'p' || k === 's') ? (Math.round(v * 100) / 100).toString() : k === 'uv' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v));
const roundV = (k, v) => +dispV(k, v);
function convert(k, v, from, to) { // the alert was written in one unit system, the phone may have switched since
  if (v == null || from === to || !from) return +v;
  const toF = to === 'F';
  if (k === 't') return toF ? v * 9 / 5 + 32 : (v - 32) * 5 / 9;
  if (k === 'w') return toF ? v / 1.609 : v * 1.609;
  if (k === 'p') return toF ? v / 25.4 : v * 25.4;
  if (k === 's') return toF ? v / 2.54 : v * 2.54;
  return +v;
}
const toMin = t => { const [h, m] = String(t || '').split(':').map(Number); return isFinite(h) ? h * 60 + (m || 0) : null; };
const sigOf = a => crypto.createHash('sha1').update(JSON.stringify([a.k, a.c, a.w, a.r, a.h, a.t, a.d, a.s, a.u, ...(a.k === 'i' ? [a.ev] : [])])).digest('hex').slice(0, 10);
const opTxt = (o, v, v2, k, F) => o === 'gt' ? `above ${dispV(k, v)}${unitTxt(k, F)}` : o === 'lt' ? `below ${dispV(k, v)}${unitTxt(k, F)}` : `${dispV(k, v)}–${dispV(k, v2)}${unitTxt(k, F)}`;

function hourIdx(W, local) { const key = local.toISOString().slice(0, 13); const i = W.hourly.time.findIndex(t => t.slice(0, 13) === key); return i < 0 ? 0 : i; }
function windowIdx(W, a, hi, today) {
  const T = W.hourly.time, n = T.length;
  const span = { h3: 3, h6: 6, h12: 12 }[a.w];
  if (span) return Array.from({ length: span }, (_, j) => hi + j).filter(k => k < n);
  if (a.w === 'today') return T.map((t, k) => k).filter(k => k >= hi && T[k].startsWith(today));
  if (a.w === 'tom') { const tom = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10); return T.map((t, k) => k).filter(k => T[k].startsWith(tom)); }
  return [hi];
}
// evaluate one condition alert → { hit, parts: [{ c, val, at, ok }] }
function evalCondition(a, W, AQ, ctx) {
  const F = ctx.F, local = new Date(NOW + (W.utc_offset_seconds * 1000)), hi = hourIdx(W, local);
  const idx = windowIdx(W, a, hi, ctx.today);
  const parts = [];
  for (const c of (a.c || []).slice(0, 3)) {
    const M = MET[c.m]; if (!M) continue;
    let series, cur = null;
    if (M.aq) {
      if (!AQ) { parts.push({ c, M, val: null, ok: false, at: null }); continue; }
      const map = new Map(AQ.hourly.time.map((t, k) => [t, AQ.hourly.us_aqi[k]]));
      series = idx.map(k => [k, map.get(W.hourly.time[k])]).filter(([, v]) => v != null);
      if (a.w === 'now' && AQ.current && AQ.current.us_aqi != null) cur = AQ.current.us_aqi;
    } else {
      series = idx.map(k => [k, W.hourly[M.h] ? W.hourly[M.h][k] : null]).filter(([, v]) => v != null);
      if (a.w === 'now' && M.c && W.current[M.c] != null) cur = W.current[M.c];
    }
    let val = null, at = null;
    if (cur != null) val = cur;
    else if (series.length) {
      if (M.sum) { val = series.reduce((x, [, v]) => x + v, 0); at = series.find(([, v]) => v > 0)?.[0] ?? null; }
      else { const low = c.o === 'lt' && !STAYS.has(c.m); const pick = low ? series.reduce((x, y) => (y[1] < x[1] ? y : x)) : series.reduce((x, y) => (y[1] > x[1] ? y : x)); val = pick[1]; at = pick[0]; }
    }
    const v = convert(M.k, +c.v, a.u, F ? 'F' : 'C'), v2 = convert(M.k, +c.v2, a.u, F ? 'F' : 'C'), r = val == null ? null : roundV(M.k, val);
    const ok = r != null && (c.o === 'gt' ? r > roundV(M.k, v) : c.o === 'lt' ? r < roundV(M.k, v) : (r >= roundV(M.k, Math.min(v, v2)) && r <= roundV(M.k, Math.max(v, v2))));
    parts.push({ c, M, val, at, ok, v, v2 });
  }
  return { hit: parts.length > 0 && parts.every(x => x.ok), parts };
}
function phrase(a, x, F, W) {
  if (x.val == null) return `${x.M.lbl}: not available here`;
  const d = dispV(x.M.k, x.val) + unitTxt(x.M.k, F);
  const when = x.at != null && a.w !== 'now' ? ` around ${hhmm(W.hourly.time[x.at])}` : '';
  const tail = a.w === 'tom' ? ' tomorrow' : '';
  if (a.w === 'now') return x.c.m === 'temp' ? `It's ${d} right now` : `${x.M.lbl} ${d} right now`;
  if (x.M.sum) return `${x.M.lbl}: ${d} total ${WIN[a.w]}`;
  if (x.c.o === 'lt' && STAYS.has(x.c.m)) return `${x.M.lbl} ${d} at most ${WIN[a.w]}`;
  const word = x.c.o === 'lt' ? 'down to' : x.c.o === 'btw' ? 'peaking at' : 'up to';
  return `${x.M.lbl} ${word} ${d}${when}${tail}`;
}
function dayLine(W, k, F) {
  const D = W.daily; if (k < 0 || k >= D.time.length) return '';
  let code = D.weather_code[k];
  if (code >= 51 && (D.precipitation_probability_max[k] ?? 0) < 30) { // a stray drizzle code on a mostly dry day: use the most common daytime sky
    const H = W.hourly, cnt = {}; H.time.forEach((t, j) => { if (t.startsWith(D.time[k]) && +t.slice(11, 13) >= 7 && +t.slice(11, 13) <= 20) cnt[H.weather_code[j]] = (cnt[H.weather_code[j]] || 0) + 1; });
    const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0]; if (top != null) code = +top;
  }
  const g = D.wind_gusts_10m_max[k], sn = D.snowfall_sum ? D.snowfall_sum[k] : 0;
  return `${EMO(code)} ${WXT[code] || ''}, high ${Math.round(D.temperature_2m_max[k])}° · low ${Math.round(D.temperature_2m_min[k])}°. Rain ${D.precipitation_probability_max[k] ?? 0}%`
    + (g >= (F ? 25 : 40) ? ` · gusts ${Math.round(g)}${unitTxt('w', F)}` : '') + (sn > 0 ? ` · snow ${dispV('s', sn)}${unitTxt('s', F)}` : '');
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dowOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
function scheduledBody(a, W, ctx) {
  const F = ctx.F, D = W.daily, H = W.hourly, c = W.current, ti = Math.max(0, D.time.indexOf(ctx.today));
  const local = new Date(NOW + W.utc_offset_seconds * 1000), hi = hourIdx(W, local);
  const peakRain = ks => { const w = ks.filter(k => H.precipitation_probability[k] != null); if (!w.length) return ''; const pk = w.reduce((x, y) => (H.precipitation_probability[y] > H.precipitation_probability[x] ? y : x)); const pp = H.precipitation_probability[pk]; return pp >= 20 ? `Rain chance up to ${pp}% around ${hhmm(H.time[pk])}.` : 'No rain expected.'; };
  const mode = ks => { const cnt = {}; for (const k of ks) cnt[H.weather_code[k]] = (cnt[H.weather_code[k]] || 0) + 1; return +Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0]; };
  switch (a.s) {
    case 'msg': return '';
    case 'now': {
      const pp = H.precipitation_probability[hi] ?? 0;
      return `Now: ${Math.round(c.temperature_2m)}° (feels ${Math.round(c.apparent_temperature)}°), ${(WXT[c.weather_code] || '').toLowerCase()}. Wind ${Math.round(c.wind_speed_10m)}${unitTxt('w', F)}${c.wind_gusts_10m > c.wind_speed_10m + 5 ? `, gusts ${Math.round(c.wind_gusts_10m)}` : ''}. Rain chance ${pp}% this hour.`;
    }
    case 'today': {
      const ks = H.time.map((t, k) => k).filter(k => k >= hi && H.time[k].startsWith(ctx.today));
      if (!ks.length) return dayLine(W, ti + 1, F) ? 'Tomorrow: ' + dayLine(W, ti + 1, F) : '';
      const temps = ks.map(k => H.temperature_2m[k]);
      return `Rest of today: ${EMO(mode(ks))} ${(WXT[mode(ks)] || '').toLowerCase()}, ${Math.round(Math.max(...temps))}° to ${Math.round(Math.min(...temps))}°. ${peakRain(ks)}`;
    }
    case 'tonight': {
      const start = Math.max(hi, H.time.findIndex(t => t.startsWith(ctx.today) && +t.slice(11, 13) === 18));
      const ks = []; for (let k = start; k < H.time.length && ks.length < 14; k++) { ks.push(k); if (+H.time[k].slice(11, 13) === 7 && k > start) break; }
      const lo = Math.min(...ks.map(k => H.temperature_2m[k]));
      return `Tonight: ${EMO(mode(ks))} ${(WXT[mode(ks)] || '').toLowerCase()}, low ${Math.round(lo)}°. ${peakRain(ks)}\nTomorrow: ${dayLine(W, ti + 1, F)}`;
    }
    case 'tom': return `Tomorrow (${DOW[dowOf(D.time[ti + 1])]}): ${dayLine(W, ti + 1, F)}`;
    case '3d': return [1, 2, 3].filter(j => D.time[ti + j]).map(j => `${DOW[dowOf(D.time[ti + j])]} ${EMO(D.weather_code[ti + j])} ${Math.round(D.temperature_2m_max[ti + j])}°/${Math.round(D.temperature_2m_min[ti + j])}° · rain ${D.precipitation_probability_max[ti + j] ?? 0}%`).join('\n');
    case 'wknd': {
      const t0 = dowOf(D.time[ti]);
      let ks = t0 === 6 ? [ti, ti + 1] : t0 === 0 ? [ti] : (() => { const k = D.time.findIndex((t, j) => j > ti && dowOf(t) === 6); return k < 0 ? [] : [k, k + 1]; })();
      ks = ks.filter(k => k < D.time.length);
      return ks.length ? ks.map(k => `${DOW[dowOf(D.time[k])]}${k === ti ? ' (today)' : ''} ${EMO(D.weather_code[k])} ${WXT[D.weather_code[k]] || ''}, ${Math.round(D.temperature_2m_max[k])}°/${Math.round(D.temperature_2m_min[k])}° · rain ${D.precipitation_probability_max[k] ?? 0}%`).join('\n') : dayLine(W, ti + 1, F);
    }
    default: return dayLine(W, ti, F);
  }
}
const cleanAlerts = p => (Array.isArray(p.custom) ? p.custom : []).filter(a => a && typeof a.id === 'string' && (a.k === 'c' || a.k === 's' || a.k === 'i')).slice(0, 25);
function customScheduledDue(s) {
  if (s.off == null) return false;
  const [today, mins] = minsLocal(s), dow = new Date(NOW + s.off).getUTCDay(), st = ((s.sent || {}).custom) || {};
  return cleanAlerts(s.prefs || {}).some(a => a.k === 's' && a.on !== false && (a.d || []).includes(dow) && (() => { const t = toMin(a.t); return t != null && mins >= t && mins <= t + 90 && (st[a.id] || {}).d !== today; })());
}
/* ---------- Live updates ("every 15 min" alerts, kind 'i') ----------
   Fires once per clock slot (:00/:15/:30/:45 for 15 min), only inside its hours + days.
   Every update reuses one tag and asks the phone not to re-alert, so it replaces the last one instead of stacking. */
const evOf = a => { const v = +a.ev || 15; return v >= 60 ? 60 : v >= 30 ? 30 : 15; };
function inWindow(a, mins) {
  const [h1, h2] = (Array.isArray(a.h) ? a.h : ['07:00', '22:00']).map(toMin);
  return h1 == null || h2 == null || h1 === h2 ? true : h1 < h2 ? (mins >= h1 && mins < h2) : (mins >= h1 || mins < h2);
}
function liveSlot(a, st, today, mins, dow) {
  // → { due, why, slot }
  const days = Array.isArray(a.d) ? a.d : [0, 1, 2, 3, 4, 5, 6], ev = evOf(a);
  // a window that runs past midnight belongs to the day it started on
  const startMin = toMin((a.h || [])[0]), wraps = startMin != null && toMin((a.h || [])[1]) != null && toMin(a.h[1]) < startMin && mins < toMin(a.h[1]);
  const dayOk = days.includes(wraps ? (dow + 6) % 7 : dow);
  if (!dayOk) return { due: false, why: 'not one of its days' };
  if (!inWindow(a, mins)) return { due: false, why: 'outside its active hours' };
  const slot = `${today}#${Math.floor(mins / ev)}`;
  if (st.slot === slot) return { due: false, why: `already sent this ${ev}-min slot`, slot };
  // just sent (e.g. switched on a minute before the slot turned): skip this slot, keep the clock rhythm
  if (st.at && NOW - st.at < Math.max(4, ev / 3) * 60000) return { due: false, why: `sent ${Math.round((NOW - st.at) / 60000)} min ago, skipping this slot`, slot, skip: true };
  return { due: true, why: 'new slot', slot };
}
function customIntervalDue(s) {
  if (s.off == null) return false;
  const [today, mins] = minsLocal(s), dow = new Date(NOW + s.off).getUTCDay(), st = ((s.sent || {}).custom) || {};
  return cleanAlerts(s.prefs || {}).some(a => a.k === 'i' && a.on !== false && (() => { const x = st[a.id] && st[a.id].sig === sigOf(a) ? st[a.id] : {}; const r = liveSlot(a, x, today, mins, dow); return r.due; })());
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function liveBody(W, F, a) {
  const c = W.current, H = W.hourly, local = new Date(NOW + W.utc_offset_seconds * 1000), hi = hourIdx(W, local);
  const t = Math.round(c.temperature_2m), fl = Math.round(c.apparent_temperature), code = c.weather_code;
  // rain chance for the next 60 minutes: the higher of this hour and the next
  const pr = Math.max(H.precipitation_probability[hi] || 0, H.precipitation_probability[hi + 1] || 0);
  let rainTxt = `Rain ${pr}% next hr`;
  const M = W.minutely_15, thr = F ? 0.004 : 0.1;
  if (M) {
    const nowISO = local.toISOString().slice(0, 16); let i0 = M.time.findIndex(x => x > nowISO) - 1; if (i0 < 0) i0 = 0;
    if ((M.precipitation[i0] || 0) >= thr || (c.precipitation || 0) >= thr) rainTxt = `${code >= 71 && code <= 86 ? 'Snowing' : 'Raining'} now · ${pr}% next hr`;
    else for (let k = i0 + 1; k <= i0 + 4 && k < M.time.length; k++) if ((M.precipitation[k] || 0) >= thr) { rainTxt = `Rain ~${hhmm(M.time[k])} · ${pr}%`; break; }
  }
  const ws = Math.round(c.wind_speed_10m), g = Math.round(c.wind_gusts_10m || 0), dir = c.wind_direction_10m != null ? COMPASS[Math.round(c.wind_direction_10m / 45) % 8] + ' ' : '';
  const wind = `Wind ${dir}${ws}${F ? ' mph' : ' km/h'}${g >= ws + (F ? 8 : 13) ? ` (gusts ${g})` : ''}`;
  const title = `${EMO(code)} ${t}° · ${WXT[code] || 'Now'}`;
  const body = `Feels ${fl}° · ${rainTxt} · ${wind}`;
  return { title, body, sum: `${t}°/${fl}° ${WXT[code] || code}, rain ${pr}%, wind ${ws}` };
}

async function customAlerts(state, sid, W, ctx) {
  const s = state.subs[sid], F = s.unit !== 'C', list = cleanAlerts(s.prefs || {});
  const sent = s.sent; sent.custom ||= {};
  for (const k of Object.keys(sent.custom)) if (!list.some(a => a.id === k)) delete sent.custom[k];
  if (!list.length && !ctx.customTest) { log('  my alerts: none set'); return; }
  log(`  my alerts: ${list.length} set, ${list.filter(a => a.on !== false).length} on`);
  const local = new Date(NOW + W.utc_offset_seconds * 1000), dow = local.getUTCDay();
  const needAQ = list.some(a => a.k === 'c' && (a.on !== false || a.id === ctx.customTest) && (a.c || []).some(c => c.m === 'aqi'));
  let AQ = null;
  if (needAQ) { try { AQ = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${s.lat}&longitude=${s.lon}&current=us_aqi&hourly=us_aqi&timezone=auto&forecast_days=3`); } catch (e) { log('  air quality read failed', e.message); } }
  const fx = { F, today: ctx.today };
  const nm = a => `${String(a.e || '🔔').slice(0, 8)} ${String(a.n || 'My alert').slice(0, 40)}`.trim();
  const tagOf = a => 'nx-c-' + a.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const msgOf = a => String(a.msg || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  let i = 0;
  for (const a of list) {
    i++;
    const isTest = a.id === ctx.customTest;
    if (a.on === false && !isTest) continue;
    const st = sent.custom[a.id] && sent.custom[a.id].sig === sigOf(a) ? sent.custom[a.id] : (sent.custom[a.id] = { sig: sigOf(a) });
    if (a.k === 'i') {
      const r = isTest ? { due: true, why: 'test' } : liveSlot(a, st, ctx.today, ctx.mins, dow);
      if (r.skip) st.slot = r.slot;
      const L = liveBody(W, F, a), ev = evOf(a);
      log(`  my alert #${i} [live update every ${ev} min, ${(a.h || []).join('-')}, ${(a.d || []).length || 7} days] → ${r.why}${r.due ? ' → SEND (' + L.sum + ')' : ''}`);
      if (!r.due) continue;
      const m = msgOf(a);
      const ok = await push(state, sid, { title: `${isTest ? '🧪 ' : ''}${L.title}`, body: [L.body, m].filter(Boolean).join('\n'), tag: 'nx-live-' + a.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 20), url: './', renotify: !!a.buzz },
        { ttl: Math.max(300, ev * 60 - 60), urgency: 'normal' });
      if (ok && !isTest) { st.slot = r.slot; st.at = NOW; }
      continue;
    }
    if (a.k === 'c') {
      const res = evalCondition(a, W, AQ, fx);
      const desc = (a.c || []).map(c => `${c.m} ${c.o} ${c.v}${c.o === 'btw' ? '-' + c.v2 : ''}`).join(' & ');
      const vals = res.parts.map(x => x.val == null ? 'n/a' : dispV(x.M.k, x.val)).join(', ');
      const [h1, h2] = (Array.isArray(a.h) ? a.h : ['07:00', '22:00']).map(toMin);
      let inHours = h1 == null || h2 == null || h1 === h2 ? true : h1 < h2 ? (ctx.mins >= h1 && ctx.mins < h2) : (ctx.mins >= h1 || ctx.mins < h2);
      if (a.w === 'tom' && ctx.mins < 17 * 60) inHours = false; // "tomorrow" alerts are an evening heads-up
      const body = res.parts.map(x => phrase(a, x, F, W)).join('. ');
      if (isTest) {
        const why = res.parts.filter(x => !x.ok).map(x => `${phrase(a, x, F, W)} (alert is for ${opTxt(x.c.o, x.v, x.v2, x.M.k, F)})`).join('. ');
        await push(state, sid, { title: `🧪 Test · ${nm(a)}`, body: res.hit ? [msgOf(a), body + '. (True right now, so this one would send.)'].filter(Boolean).join('\n') : `Not happening right now. ${why}. You'll get it when it is.`, tag: tagOf(a), url: './#notify' }, { ttl: 900 });
        log(`  my alert #${i} TEST [${desc} ${a.w}] values ${vals} → ${res.hit ? 'true' : 'false'}, test sent`);
        continue;
      }
      let fire = false, why = '';
      if (!inHours) why = a.w === 'tom' ? 'waits for the evening' : 'outside its active hours';
      else if (a.r === 'flip') { fire = res.hit && !st.was && NOW - (st.at || 0) > 3600e3; why = res.hit ? (st.was ? 'still true, already sent' : fire ? 'just became true' : 'sent within the hour') : 'false (re-armed)'; st.was = res.hit; }
      else { fire = res.hit && st.d !== ctx.today; why = res.hit ? (fire ? 'true' : 'already sent today') : 'false'; }
      log(`  my alert #${i} [${desc} ${a.w}${a.r === 'flip' ? ', every time' : ', once a day'}] values ${vals} → ${why}${fire ? ' → SEND' : ''}`);
      if (fire) {
        const ok = await push(state, sid, { title: nm(a), body: [msgOf(a), body + '.'].filter(Boolean).join('\n'), tag: tagOf(a), url: './' }, { ttl: 2 * 3600, urgency: 'high' });
        if (ok) { st.d = ctx.today; st.at = NOW; }
      }
    } else {
      const t = toMin(a.t), days = Array.isArray(a.d) ? a.d : [];
      const due = t != null && days.includes(dow) && ctx.mins >= t && ctx.mins <= t + 90 && st.d !== ctx.today;
      if (!isTest) log(`  my alert #${i} [timed ${a.t} on ${days.map(d => DOW[d]).join(',') || 'no days'}, ${a.s}] → ${due ? 'SEND' : st.d === ctx.today ? 'already sent today' : 'not now'}`);
      if (!due && !isTest) continue;
      const late = !isTest && ctx.mins - t > 20;
      const content = scheduledBody(a, W, fx), m = msgOf(a);
      const body = [m, content].filter(Boolean).join('\n') || 'Your timed alert.';
      const ok = await push(state, sid, { title: `${isTest ? '🧪 Test · ' : ''}${nm(a)}${late ? ' (a bit late)' : ''}`, body, tag: tagOf(a), url: './' }, { ttl: isTest ? 900 : 2 * 3600 });
      if (isTest) log(`  my alert #${i} TEST [timed ${a.s}] sent`);
      else if (ok) { st.d = ctx.today; st.at = NOW; }
    }
  }
  if (ctx.customTest && !list.some(a => a.id === ctx.customTest)) {
    log('  test asked for an alert that is not in the saved list');
    await push(state, sid, { title: '🧪 Test', body: 'That alert hasn\'t synced yet. Open the app, then tap Test again.', tag: 'nexus-test', url: './#notify' }, { ttl: 900 });
  }
}

/* ---------- main ---------- */
const state = loadState(); state.subs ||= {};
const minsLocal = (s) => { const l = new Date(NOW + (s.off || 0)); return [l.toISOString().slice(0, 10), l.getUTCHours() * 60 + l.getUTCMinutes()]; };
function morningDue(s) {
  const p = s.prefs || {}; if (p.morning === false || s.off == null) return false;
  const [mh, mm] = (p.morningTime || '06:30').split(':').map(Number), target = mh * 60 + mm;
  const [today, mins] = minsLocal(s);
  return (s.sent || {}).morning !== today && mins >= target && mins <= target + 150;
}
async function cycle(verbose) {
  NOW = Date.now() + NOW_SHIFT;
  for (const m of await readInbox(state, verbose)) {
    if (m.type === 'unsub') { const sid = m.endpoint && idOf(m.endpoint); if (sid && state.subs[sid]) { delete state.subs[sid]; log('unsubscribed', sid); } continue; }
    if (!m.sub || !m.sub.endpoint || !m.sub.keys) continue;
    if (!/^https:\/\//.test(m.sub.endpoint)) continue;
    const sid = idOf(m.sub.endpoint), prev = state.subs[sid] || {};
    state.subs[sid] = { ...prev, sub: m.sub, lat: Math.round(+m.lat * 100) / 100, lon: Math.round(+m.lon * 100) / 100, name: String(m.name || '').slice(0, 40), unit: m.unit === 'C' ? 'C' : 'F', prefs: m.prefs || {}, at: m._at };
    if (m.type === 'test') state.subs[sid].testPending = (typeof m.testAlert === 'string' && m.testAlert) ? m.testAlert.slice(0, 24) : true;
    log(`${prev.sub ? 'updated' : 'new'} subscriber ${sid} (${m.type})`);
  }
  // keep the 5 most recent devices
  const ids = Object.keys(state.subs).sort((a, b) => (state.subs[b].at || 0) - (state.subs[a].at || 0));
  for (const sid of ids.slice(5)) delete state.subs[sid];
  if (verbose) log(`${Object.keys(state.subs).length} subscriber(s)`);
  for (const sid of Object.keys(state.subs)) {
    // honour the "Check every" choice from the app (5-60 min); the morning summary and tests don't wait for it
    const s = state.subs[sid], every = Math.min(60, Math.max(5, +(s.prefs && s.prefs.every) || 15));
    const due = !s.lastCheck || NOW - s.lastCheck >= every * 60000 - 30000;
    const md = morningDue(s), cd = !due && customScheduledDue(s); // timed "My alerts" don't wait for "Check every" either
    const ld = !due && !cd && customIntervalDue(s); // Live updates run on their own 15/30/60-min clock
    if (!due && !md && !cd && !ld && !s.testPending && !FORCE_TEST) { if (verbose) log(`skip ${sid}: checks every ${every} min, last ${Math.round((NOW - s.lastCheck) / 60000)} min ago`); continue; }
    log(`checking ${sid} (every ${every} min${md ? ', morning summary due' : ''}${cd ? ', timed alert due' : ''}${ld ? ', live update due' : ''}${s.testPending || FORCE_TEST ? ', test requested' : ''})`);
    s.lastCheck = NOW;
    try { await checkWeather(state, sid); } catch (e) { log('check failed for', sid, e.message); }
  }
  FORCE_TEST = false;
  state.lastRun = NOW;
  saveState(state);
}
const started = Date.now();
await cycle(true);
if (LOOP_MINUTES > 0) {
  log(`watching: one pass a minute for ${LOOP_MINUTES} min`);
  let n = 0;
  while (Date.now() - started + TICK_MS < LOOP_MINUTES * 60000) {
    await new Promise(r => setTimeout(r, TICK_MS));
    try { await cycle(false); } catch (e) { log('cycle failed', e.message); }
    if (++n % 15 === 0) log(`still watching (${Math.round((Date.now() - started) / 60000)} min)`);
  }
}
log('done');

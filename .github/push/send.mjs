// NEXUS Ultimate push sender. Runs in GitHub Actions every ~15 min (see .github/workflows/weather-push.yml).
// Reads sealed subscriptions from ntfy.sh, checks the weather, sends Web Push (VAPID) notifications.
// State (subscriptions + what was already sent) is encrypted and kept in the Actions cache, never in the repo.
import webpush from 'web-push';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const TOPIC = env.NTFY_TOPIC;
const STATE_FILE = path.join(env.STATE_DIR || '.state', 'state.bin');
const FORCE_TEST = env.FORCE_TEST === 'true';
const DRY = env.DRY_RUN === 'true';
const NOW = env.NOW_OVERRIDE ? Date.parse(env.NOW_OVERRIDE) : Date.now();
const UA = 'NEXUS-Ultimate-Weather (github.com/olivercraftboycompany-design/Ultimate-Weather)';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

for (const k of ['VAPID_PUBLIC', 'VAPID_PRIVATE', 'BOX_PRIVATE', 'NTFY_TOPIC']) if (!env[k]) { console.error('Missing ' + k); process.exit(1); }
webpush.setVapidDetails('mailto:noreply@github.com', env.VAPID_PUBLIC, env.VAPID_PRIVATE);

/* ---------- crypto: open sealed messages, encrypt state at rest ---------- */
const b64u = s => Buffer.from(s, 'base64url');
const boxPriv = b64u(env.BOX_PRIVATE);
export function open(sealed) {
  const [v, eph, iv, ct] = String(sealed).trim().split('.');
  if (v !== 'uw1' || !ct) throw new Error('not a uw1 message');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(boxPriv);
  const shared = ecdh.computeSecret(b64u(eph));
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('uw-box-v1'), 32));
  const data = b64u(ct), tag = data.subarray(data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, b64u(iv)); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]).toString('utf8'));
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
async function readInbox(state) {
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
  log(`ntfy: ${msgs.length} new message(s), ${out.length} readable`);
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
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&timezone=auto&forecast_days=3`
    + '&current=temperature_2m,apparent_temperature,weather_code,precipitation'
    + '&minutely_15=precipitation,weather_code&past_minutely_15=1&forecast_minutely_15=6'
    + '&hourly=precipitation_probability,temperature_2m,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max'
    + (F ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '');
  let W;
  try { W = await getJSON(u); } catch (e) { log('open-meteo failed', e.message); return; }
  const off = W.utc_offset_seconds * 1000, local = new Date(NOW + off);
  const today = local.toISOString().slice(0, 10), mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  const nowISO = local.toISOString().slice(0, 16);
  const D = W.daily, ti = Math.max(0, D.time.indexOf(today)), c = W.current;
  const place = s.name ? ` in ${s.name}` : '';

  // test request from the app
  if (s.testPending || FORCE_TEST) {
    await push(state, sid, { title: '✅ Push from the weather server works!', body: `Right now${place}: ${Math.round(c.temperature_2m)}${deg} and ${(WXT[c.weather_code] || '').toLowerCase()}. You're all set.`, tag: 'nexus-test', url: './#notify' }, { ttl: 900 });
    s.testPending = false;
  }

  // NWS alerts (US only)
  if (p.alerts !== false) {
    try {
      const A = await getJSON(`https://api.weather.gov/alerts/active?point=${s.lat},${s.lon}`, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } }, 12000);
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
    if (sent.morning !== today && mins >= target - 10 && mins <= target + 150) {
      const hi = Math.round(D.temperature_2m_max[ti]), lo = Math.round(D.temperature_2m_min[ti]);
      const H = W.hourly, dayIdx = H.time.map((t, k) => [t, k]).filter(([t]) => t.startsWith(today) && +t.slice(11, 13) >= 6 && +t.slice(11, 13) <= 22);
      const wet = dayIdx.filter(([, k]) => (H.precipitation_probability[k] || 0) >= 40);
      let note;
      if (wet.length) { const peak = wet.reduce((a, b) => (H.precipitation_probability[b[1]] > H.precipitation_probability[a[1]] ? b : a)); note = `${H.precipitation_probability[peak[1]]}% chance of ${H.weather_code[peak[1]] >= 71 && H.weather_code[peak[1]] <= 86 ? 'snow' : 'rain'} around ${hhmm(peak[0])}, bring an umbrella ☔`; }
      else note = (D.precipitation_probability_max[ti] || 0) >= 20 ? `Low rain chance (${D.precipitation_probability_max[ti]}%).` : 'No rain expected.';
      const feels = Math.round(c.apparent_temperature);
      const wear = F ? (feels < 32 ? 'Big coat weather 🧥' : feels < 50 ? 'Jacket weather 🧥' : feels < 65 ? 'Hoodie weather' : feels < 80 ? 'T-shirt weather 👕' : 'Hot one, stay cool 🥵') : (feels < 0 ? 'Big coat weather 🧥' : feels < 10 ? 'Jacket weather 🧥' : feels < 18 ? 'Hoodie weather' : feels < 27 ? 'T-shirt weather 👕' : 'Hot one, stay cool 🥵');
      await push(state, sid, { title: `${EMO(D.weather_code[ti])} Good morning! High ${hi}${deg} · Low ${lo}${deg}`, body: `${WXT[D.weather_code[ti]] || ''} today${place}. ${note} It's ${Math.round(c.temperature_2m)}${deg} now (feels ${feels}${deg}). ${wear}.`, tag: 'nexus-morning', url: './' }, { ttl: 3 * 3600 });
      sent.morning = today;
    }
  }

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
}

/* ---------- main ---------- */
const state = loadState(); state.subs ||= {};
for (const m of await readInbox(state)) {
  if (m.type === 'unsub') { const sid = m.endpoint && idOf(m.endpoint); if (sid && state.subs[sid]) { delete state.subs[sid]; log('unsubscribed', sid); } continue; }
  if (!m.sub || !m.sub.endpoint || !m.sub.keys) continue;
  if (!/^https:\/\//.test(m.sub.endpoint)) continue;
  const sid = idOf(m.sub.endpoint), prev = state.subs[sid] || {};
  state.subs[sid] = { ...prev, sub: m.sub, lat: Math.round(+m.lat * 100) / 100, lon: Math.round(+m.lon * 100) / 100, name: String(m.name || '').slice(0, 40), unit: m.unit === 'C' ? 'C' : 'F', prefs: m.prefs || {}, at: m._at };
  if (m.type === 'test') state.subs[sid].testPending = true;
  log(`${prev.sub ? 'updated' : 'new'} subscriber ${sid} (${m.type})`);
}
// keep the 5 most recent devices
const ids = Object.keys(state.subs).sort((a, b) => (state.subs[b].at || 0) - (state.subs[a].at || 0));
for (const sid of ids.slice(5)) delete state.subs[sid];
log(`${Object.keys(state.subs).length} subscriber(s)`);
for (const sid of Object.keys(state.subs)) {
  try { await checkWeather(state, sid); } catch (e) { log('check failed for', sid, e.message); }
}
state.lastRun = NOW;
saveState(state);
log('done');

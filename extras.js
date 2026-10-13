/* NEXUS Ultimate extras: install app, offline mode, rain nowcast, sun + golden hour, share card, push notifications. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls = (k, d) => { try { const v = localStorage.getItem('nx_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('nx_' + k, JSON.stringify(v)); } catch {} };
const S = () => window.NX.S;
const F = () => window.NX.F();
const toast = m => window.NX.toast(m);
const WXE = c => c == null ? '🌡️' : c === 0 ? '☀️' : c <= 2 ? '⛅' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : c <= 86 ? '🌨️' : '⛈️';
const WXT = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Showers',81:'Showers',82:'Violent showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'T-storm + hail',99:'T-storm + hail'};

/* ---------- time helpers (location's own clock via utc_offset_seconds) ---------- */
const off = () => (S().D && S().D.utc_offset_seconds || 0) * 1000;
const locNow = () => new Date(Date.now() + off());               // read with getUTC*
const isoToMs = iso => Date.parse(iso + 'Z') - off();             // open-meteo local ISO -> epoch
const fmt = ms => { const d = new Date(ms + off()); let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
const dur = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

/* ---------- service worker + install ---------- */
let deferredPrompt = null;
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'nx-push') window.__lastPush = e.data; });
  }
  const btn = $('#installBtn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (!standalone) btn.classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); deferredPrompt = null; toast('Installed! Find NEXUS on your home screen'); });
  btn.onclick = async () => {
    if (!deferredPrompt) { toast('Use your browser menu → Install app'); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice.catch(() => ({}));
    deferredPrompt = null; if (outcome === 'accepted') btn.classList.add('hidden');
  };
  const banner = $('#offlineBar');
  const upd = () => banner.classList.toggle('hidden', navigator.onLine && !S().offline);
  window.addEventListener('online', () => { upd(); window.NX.reload(); });
  window.addEventListener('offline', upd);
  document.addEventListener('nx:data', e => {
    $('#offlineText').textContent = e.detail.offline ? `Offline · showing your last forecast from ${new Date(e.detail.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'You\'re offline';
    upd();
  });
}

/* ---------- jump links (#radar, #notify) from home screen shortcuts + notifications ---------- */
function jump() {
  const id = { '#radar': 'radarCard', '#notify': 'notifyCard', '#rain': 'nowcastCard' }[location.hash];
  if (!id) return;
  const go = () => { const el = document.getElementById(id); if (el && el.offsetParent) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; } return false; };
  if (!go()) document.addEventListener('nx:data', () => setTimeout(go, 300), { once: true });
}

/* ---------- rain nowcast: next 2 hours in 15-min steps ---------- */
async function loadNowcast() {
  const L = S().loc; if (!L || S().offline) return;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&minutely_15=precipitation,weather_code&forecast_minutely_15=9&timezone=auto${F() ? '&precipitation_unit=inch' : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error(r.status);
    renderNowcast(await r.json());
  } catch (e) { $('#nowcast').innerHTML = '<p class="text-sm text-zinc-500">Nowcast unavailable right now.</p>'; }
}
function renderNowcast(d) {
  const m = d.minutely_15, o = (d.utc_offset_seconds || 0) * 1000, now = Date.now();
  const toMs = iso => Date.parse(iso + 'Z') - o;
  let idx = m.time.map(toMs).findIndex(t => t + 15 * 60000 > now); if (idx < 0) idx = 0;
  const T = m.time.slice(idx, idx + 8), P = m.precipitation.slice(idx, idx + 8).map(v => v || 0), C = m.weather_code.slice(idx, idx + 8);
  const thr = F() ? 0.004 : 0.1, wet = P.map(v => v >= thr), snow = C.map(c => c >= 71 && c <= 86);
  const word = wet.some((w, i) => w && snow[i]) ? 'Snow' : 'Rain';
  let head, sub;
  const lt = iso => { let [h, mm] = iso.slice(11, 16).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, '0')} ${ap}`; };
  if (!wet.some(Boolean)) { head = 'No rain for the next 2 hours'; sub = 'Dry skies through ' + lt(T[T.length - 1]); }
  else if (wet[0]) { const end = wet.indexOf(false); head = end < 0 ? `${word} for the next 2 hours` : `${word} ending around ${lt(T[end])}`; sub = 'It\'s coming down now'; }
  else { const s = wet.indexOf(true); const mins = Math.max(5, Math.round((toMs(T[s]) - now) / 60000)); head = `${word} starting in ~${mins} min`; sub = `Around ${lt(T[s])}. Grab a jacket.`; }
  const max = Math.max(thr * 4, ...P);
  $('#nowcast').innerHTML = `
    <div class="flex items-start gap-3 mb-4"><span class="text-3xl leading-none">${wet.some(Boolean) ? (word === 'Snow' ? '🌨️' : '🌧️') : '🌤️'}</span>
      <div><p class="font-semibold text-zinc-100">${head}</p><p class="text-xs text-zinc-400 mt-0.5">${sub}</p></div></div>
    <div class="nc-bars">${P.map((v, i) => `<div class="nc-col" title="${lt(T[i])}: ${v}${F() ? ' in' : ' mm'}"><div class="nc-bar ${wet[i] ? 'on' : ''}" style="height:${Math.max(6, Math.round(v / max * 100))}%"></div></div>`).join('')}</div>
    <div class="flex justify-between text-[11px] text-zinc-500 mt-1.5 tabular-nums"><span>Now</span><span>${lt(T[4] || T[0])}</span><span>${lt(T[T.length - 1])}</span></div>`;
}

/* ---------- sun, golden hour, blue hour ---------- */
const rad = Math.PI / 180;
function sunElev(ms, lat, lon) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = gmst * 15 * rad + lon * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H)) / rad;
}
function crossings(lat, lon, dayStartMs, angle) {
  const out = []; let prev = sunElev(dayStartMs, lat, lon) - angle;
  for (let t = dayStartMs + 120000; t <= dayStartMs + 86400000; t += 120000) {
    const v = sunElev(t, lat, lon) - angle;
    if ((prev < 0) !== (v < 0)) { let a = t - 120000, b = t; for (let k = 0; k < 12; k++) { const mid = (a + b) / 2; ((sunElev(mid, lat, lon) - angle < 0) === (prev < 0)) ? a = mid : b = mid; } out.push({ t: (a + b) / 2, up: v > 0 }); }
    prev = v;
  }
  return out;
}
function renderSun() {
  const D = S().D, L = S().loc; if (!D || !L) return;
  const ln = locNow(); const dayStart = Date.UTC(ln.getUTCFullYear(), ln.getUTCMonth(), ln.getUTCDate()) - off();
  const g = a => crossings(L.lat, L.lon, dayStart, a);
  const rise = g(-0.833).find(c => c.up), set = g(-0.833).find(c => !c.up);
  const six = g(6), blue = g(-4), civ = g(-6);
  const el = $('#sunCard');
  if (!rise || !set) { el.innerHTML = `<p class="text-sm text-zinc-400">${sunElev(Date.now(), L.lat, L.lon) > 0 ? 'Midnight sun today ☀️' : 'Polar night today 🌑'}</p>`; return; }
  const amGoldEnd = six.find(c => c.up), pmGoldStart = six.find(c => !c.up);
  const amBlueStart = civ.find(c => c.up), amBlueEnd = blue.find(c => c.up);
  const pmBlueStart = blue.find(c => !c.up), pmBlueEnd = civ.find(c => !c.up);
  const now = Date.now();
  const events = [
    ['Blue hour', amBlueStart && amBlueStart.t, amBlueEnd && amBlueEnd.t, 'ph-moon-stars', 'text-indigo-300'],
    ['Sunrise', rise.t, null, 'ph-sun-horizon', 'text-amber-300'],
    ['Golden hour', rise.t, amGoldEnd && amGoldEnd.t, 'ph-camera', 'text-amber-400'],
    ['Golden hour', pmGoldStart && pmGoldStart.t, set.t, 'ph-camera', 'text-amber-400'],
    ['Sunset', set.t, null, 'ph-sun-horizon', 'text-orange-400'],
    ['Blue hour', pmBlueStart && pmBlueStart.t, pmBlueEnd && pmBlueEnd.t, 'ph-moon-stars', 'text-indigo-300']
  ].filter(e => e[1]);
  const next = events.find(e => (e[2] || e[1]) > now);
  let nextLine = 'Sun\'s down. See you tomorrow 🌙';
  if (next) nextLine = next[1] > now ? `${next[0]} in ${dur(next[1] - now)}` : `${next[0]} now · ends in ${dur(next[2] - now)}`;
  const dayPct = Math.max(0, Math.min(100, (now - rise.t) / (set.t - rise.t) * 100));
  el.innerHTML = `
    <div class="flex items-center justify-between mb-3"><p class="font-semibold text-zinc-100">${esc(nextLine)}</p><span class="text-xs text-zinc-500">${dur(set.t - rise.t)} of daylight</span></div>
    <div class="sun-track"><div class="sun-gold l"></div><div class="sun-gold r"></div><div class="sun-dot" style="left:${dayPct}%;${now < rise.t || now > set.t ? 'opacity:.25' : ''}"></div></div>
    <div class="grid grid-cols-2 gap-2 mt-4">${events.map(e => `<div class="sun-row ${next === e ? 'next' : ''}"><i class="ph-fill ${e[3]} ${e[4]}"></i><div><div class="text-[11px] text-zinc-500 uppercase tracking-wider">${e[0]}</div><div class="text-sm font-semibold text-zinc-200 tabular-nums">${fmt(e[1])}${e[2] ? '–' + fmt(e[2]) : ''}</div></div></div>`).join('')}</div>`;
}

/* ---------- share today's weather as an image ---------- */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
async function makeCard() {
  const D = S().D, L = S().loc; if (!D) return null;
  const c = D.current, d = D.daily, H = D.hourly;
  const ti = Math.max(0, d.time.indexOf(c.time.slice(0, 10)));
  let h0 = H.time.findIndex(t => t.slice(0, 13) === c.time.slice(0, 13)); if (h0 < 0) h0 = 0;
  const u = F() ? '°' : '°';
  const W = 1080, Hh = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const x = cv.getContext('2d');
  const day = c.is_day, code = c.weather_code;
  const gr = x.createLinearGradient(0, 0, W, Hh);
  if (code >= 95) { gr.addColorStop(0, '#1e1b4b'); gr.addColorStop(1, '#0f172a'); }
  else if (code >= 51) { gr.addColorStop(0, '#1e3a8a'); gr.addColorStop(1, '#0b1120'); }
  else if (!day) { gr.addColorStop(0, '#111827'); gr.addColorStop(1, '#030712'); }
  else { gr.addColorStop(0, '#2563eb'); gr.addColorStop(1, '#0c1a3d'); }
  x.fillStyle = gr; x.fillRect(0, 0, W, Hh);
  const glow = x.createRadialGradient(W * .85, 160, 10, W * .85, 160, 520); glow.addColorStop(0, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, Hh);
  const font = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
  x.font = font(800, 30); x.globalAlpha = .75; x.fillText('NEXUS  ULTIMATE', 80, 110); x.globalAlpha = 1;
  x.font = font(700, 64); x.fillText((L && L.name || 'My weather').slice(0, 26), 80, 200);
  const ln = locNow(); x.font = font(500, 34); x.globalAlpha = .7;
  x.fillText(ln.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), 80, 252); x.globalAlpha = 1;
  x.font = '220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(WXE(code), 680, 520);
  x.font = font(800, 260); x.fillText(Math.round(c.temperature_2m) + u, 64, 560);
  x.font = font(600, 54); x.fillText(WXT[code] || '', 80, 650);
  x.font = font(500, 38); x.globalAlpha = .8;
  x.fillText(`H ${Math.round(d.temperature_2m_max[ti])}${u}   L ${Math.round(d.temperature_2m_min[ti])}${u}   Feels ${Math.round(c.apparent_temperature)}${u}`, 80, 712); x.globalAlpha = 1;
  const stats = [['💨', 'Wind', Math.round(c.wind_speed_10m) + (F() ? ' mph' : ' km/h')], ['💧', 'Humidity', Math.round(c.relative_humidity_2m) + '%'], ['☔', 'Rain', (d.precipitation_probability_max[ti] ?? 0) + '%'], ['🕶️', 'UV', Math.round(d.uv_index_max[ti] ?? 0)]];
  stats.forEach((s, i) => {
    const bx = 80 + i * 235, by = 770; x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, bx, by, 215, 170, 32); x.fill();
    x.fillStyle = '#fff'; x.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(s[0], bx + 26, by + 64);
    x.font = font(500, 26); x.globalAlpha = .7; x.fillText(s[1], bx + 26, by + 108); x.globalAlpha = 1; x.font = font(700, 40); x.fillText(String(s[2]), bx + 26, by + 150);
  });
  x.fillStyle = 'rgba(255,255,255,.08)'; rr(x, 80, 980, 920, 250, 36); x.fill();
  for (let i = 0; i < 6; i++) {
    const k = h0 + 1 + i * 2; if (!H.time[k]) break;
    const cx = 80 + 77 + i * 153; x.textAlign = 'center'; x.fillStyle = '#fff';
    let hr = +H.time[k].slice(11, 13); const ap = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12;
    x.font = font(500, 26); x.globalAlpha = .7; x.fillText(hr + ' ' + ap, cx, 1030); x.globalAlpha = 1;
    x.font = '52px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(WXE(H.weather_code[k]), cx, 1110);
    x.font = font(700, 38); x.fillText(Math.round(H.temperature_2m[k]) + u, cx, 1170);
    x.font = font(500, 22); x.fillStyle = '#93c5fd'; x.fillText((H.precipitation_probability[k] || 0) + '%', cx, 1205);
  }
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.globalAlpha = .55; x.font = font(500, 26);
  x.fillText('olivercraftboycompany-design.github.io/Ultimate-Weather', 80, 1295); x.globalAlpha = 1;
  return await new Promise(res => cv.toBlob(res, 'image/png'));
}
let cardBlob = null;
async function openShareCard() {
  if (!S().D) return toast('Weather still loading');
  try { await document.fonts.ready; } catch {}
  cardBlob = await makeCard(); if (!cardBlob) return;
  const img = $('#cardImg'); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(cardBlob);
  $('#cardModal').classList.remove('hidden'); $('#cardModal').classList.add('flex');
}
function bindShareCard() {
  $('#cardBtn').onclick = openShareCard;
  const close = () => { $('#cardModal').classList.add('hidden'); $('#cardModal').classList.remove('flex'); };
  $('#cardClose').onclick = close; $('#cardModal').onclick = e => { if (e.target.id === 'cardModal') close(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#cardSave').onclick = () => { const a = document.createElement('a'); a.href = $('#cardImg').src; a.download = 'nexus-weather.png'; a.click(); };
  $('#cardShare').onclick = async () => {
    const file = new File([cardBlob], 'nexus-weather.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Today\'s weather' }); } catch (e) { if (e.name !== 'AbortError') toast('Share failed, try Save'); } }
    else $('#cardSave').click();
  };
}

/* ---------- push notifications ---------- */
const DEF = { on: false, alerts: true, rain: true, morning: true, morningTime: '06:30', temp: true, every: 15, loc: null, lastPost: 0, endpoint: null };
let P = { ...DEF, ...ls('push', {}) };
const TYPES = [
  ['alerts', 'ph-warning', 'text-red-400', 'Severe weather', 'NWS warnings, watches and advisories for your spot'],
  ['rain', 'ph-cloud-rain', 'text-blue-400', 'Rain starting soon', 'Heads up about 15–60 min before rain or snow'],
  ['morning', 'ph-sun-horizon', 'text-amber-400', 'Morning forecast', 'High, low and rain chances when you wake up'],
  ['temp', 'ph-thermometer-cold', 'text-cyan-300', 'Freeze & big temp drops', 'Evening heads-up if tomorrow is freezing or way colder']
];
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function payload(sub) {
  const loc = P.loc || S().loc;
  return { v: 1, sub, lat: Math.round(loc.lat * 100) / 100, lon: Math.round(loc.lon * 100) / 100, name: (loc.name || '').split(',')[0].slice(0, 40),
    unit: S().unit, prefs: { alerts: P.alerts, rain: P.rain, morning: P.morning, morningTime: P.morningTime, temp: P.temp, every: P.every || 15, custom: (Array.isArray(P.custom) ? P.custom : []).map(({ preset, ...a }) => a) },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
async function saveConfig(sub) {
  try { const c = await caches.open('uw-config'); await c.put('./uw-config.json', new Response(JSON.stringify({ on: P.on, payload: payload(null) }), { headers: { 'Content-Type': 'application/json' } })); } catch {}
}
async function publish(type, extra = {}) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub && type !== 'unsub') throw new Error('no subscription');
  const body = { ...payload(sub ? sub.toJSON() : null), ...extra, type, ts: Date.now() };
  if (type === 'unsub') body.endpoint = P.endpoint;
  await window.UWPush.post(body);
  if (type === 'sub') { P.lastPost = Date.now(); P.endpoint = sub.endpoint; }
  lsSet('push', P); await saveConfig();
}
async function enablePush() {
  if (!pushSupported()) { status('This browser can\'t do push. Use Chrome on Android, or install the app first.', 'warn'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { status(perm === 'denied' ? 'Notifications are blocked. Tap the ⓘ or lock icon by the address bar → Permissions → Notifications → Allow, then try again.' : 'You didn\'t allow notifications. Tap Turn on again whenever.', 'warn'); return; }
  status('Turning on…');
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: window.UWPush.b64u.dec(window.UWPush.VAPID_PUBLIC) });
    P.on = true; P.loc = P.loc || { lat: S().loc.lat, lon: S().loc.lon, name: S().loc.name };
    await publish('sub');
    status('On ✅ Alerts are set for ' + (P.loc.name || 'your location').split(',')[0] + '.', 'ok');
    renderPush();
  } catch (e) { console.warn('push enable failed', e); status('Couldn\'t turn on: ' + (e.message || e) + '. Check your connection and try again.', 'warn'); }
}
async function disablePush() {
  try { await publish('unsub'); } catch {}
  try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch {}
  P.on = false; P.endpoint = null; lsSet('push', P); await saveConfig(); renderPush(); status('Notifications are off.');
}
async function testPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🔔 NEXUS test', { body: 'Notifications work on this phone! A real one from the weather server is on its way too.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'nexus-test', data: { url: './#notify' } });
    await publish('test');
    status('Sent ✅ You should see one now. A real push from the weather server lands in about a minute.', 'ok');
  } catch (e) { status('Test failed: ' + (e.message || e), 'warn'); }
}
let prefT;
function prefChanged() { lsSet('push', P); clearTimeout(prefT); if (P.on) prefT = setTimeout(() => publish('sub').then(() => status('Saved ✅', 'ok')).catch(() => status('Saved on this phone. Will sync when you\'re online.', 'warn')), 700); }
function status(msg, kind) { const el = $('#pushStatus'); el.textContent = msg; el.className = 'text-xs mt-3 ' + (kind === 'ok' ? 'text-emerald-400' : kind === 'warn' ? 'text-amber-400' : 'text-zinc-400'); }
function renderPush() {
  const on = P.on && pushSupported() && Notification.permission === 'granted';
  $('#pushMain').innerHTML = on
    ? `<button id="pushTest" class="btn-soft"><i class="ph ph-paper-plane-tilt"></i> Send test</button><button id="pushOff" class="btn-ghost">Turn off</button>`
    : `<button id="pushOn" class="btn-primary !py-2.5 !px-5 flex items-center gap-2"><i class="ph-fill ph-bell-ringing"></i> Turn on notifications</button>`;
  $('#pushBadge').textContent = on ? 'ON' : 'OFF'; $('#pushBadge').className = 'nbadge ' + (on ? 'on' : '');
  const loc = P.loc || S().loc || {};
  $('#pushLoc').innerHTML = `Alerts for <b class="text-zinc-200">${esc((loc.name || 'your location').split(',')[0])}</b>` +
    (on && S().loc && P.loc && (Math.abs(S().loc.lat - P.loc.lat) > .05 || Math.abs(S().loc.lon - P.loc.lon) > .05) ? ` · <button id="pushHere" class="text-blue-400 font-semibold">use ${esc((S().loc.name || 'this place').split(',')[0])}</button>` : '');
  $('#pushTypes').innerHTML = TYPES.map(t => `<label class="ntype"><i class="ph-fill ${t[1]} ${t[2]} text-xl"></i><span class="flex-1"><span class="block text-sm font-semibold text-zinc-200">${t[3]}</span><span class="block text-xs text-zinc-500">${t[4]}</span></span>${t[0] === 'morning' ? `<input type="time" id="pushTime" class="ntime" value="${P.morningTime}" aria-label="Morning forecast time">` : ''}<input type="checkbox" class="nsw" data-k="${t[0]}" ${P[t[0]] ? 'checked' : ''} aria-label="${t[3]}"></label>`).join('');
  document.querySelectorAll('#pushTypes .nsw').forEach(c => c.onchange = () => { P[c.dataset.k] = c.checked; prefChanged(); });
  $('#pushTime').onchange = e => { P.morningTime = e.target.value || '06:30'; prefChanged(); };
  const ev = $('#pushEvery'); if (ev) { ev.value = String(P.every || 15); ev.onchange = e => { P.every = +e.target.value || 15; prefChanged(); if (!P.on) status('Saved. Turn on notifications to start the checks.'); }; }
  const b = id => document.getElementById(id);
  if (b('pushOn')) b('pushOn').onclick = enablePush;
  if (b('pushOff')) b('pushOff').onclick = disablePush;
  if (b('pushTest')) b('pushTest').onclick = testPush;
  if (b('pushHere')) b('pushHere').onclick = () => { P.loc = { lat: S().loc.lat, lon: S().loc.lon, name: S().loc.name }; prefChanged(); renderPush(); };
}
async function refreshPush() {
  // keep the server in sync: re-send if the phone's subscription changed or every 3 days
  if (!P.on || !pushSupported() || Notification.permission !== 'granted' || !navigator.onLine) return;
  try {
    const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: window.UWPush.b64u.dec(window.UWPush.VAPID_PUBLIC) });
    if (sub.endpoint !== P.endpoint || Date.now() - P.lastPost > 3 * 864e5) await publish('sub');
  } catch (e) { console.warn('push refresh', e); }
}


/* ---------- My alerts: custom notifications he builds himself ---------- */
const MA_MET = [ // key, label, kind, default F, default C, step
  ['temp', 'Temperature', 't', 50, 10, 1], ['feels', 'Feels like', 't', 50, 10, 1], ['wind', 'Wind speed', 'w', 20, 30, 1], ['gust', 'Wind gusts', 'w', 25, 40, 1],
  ['rain', 'Rain chance', '%', 50, 50, 5], ['precip', 'Rain amount', 'p', 0.25, 6, 0.05], ['snow', 'Snowfall', 's', 1, 2, 0.1], ['uv', 'UV index', 'uv', 7, 7, 1],
  ['aqi', 'Air quality (AQI)', 'aqi', 100, 100, 5], ['hum', 'Humidity', '%', 80, 80, 5], ['dew', 'Dew point', 't', 65, 18, 1], ['cloud', 'Cloud cover', '%', 20, 20, 5]
];
const MA_M = Object.fromEntries(MA_MET.map(m => [m[0], m]));
const MA_WIN = [['now', 'Right now'], ['h3', 'In the next 3 hours'], ['h6', 'In the next 6 hours'], ['h12', 'In the next 12 hours'], ['today', 'Later today'], ['tom', 'Tomorrow (heads-up after 5 PM)']];
const MA_WIN_SHORT = { now: 'now', h3: 'next 3h', h6: 'next 6h', h12: 'next 12h', today: 'today', tom: 'tomorrow' };
const MA_SEND = [['tonight', 'Tonight + tomorrow'], ['tom', "Tomorrow's forecast"], ['now', 'Current conditions'], ['today', 'Rest of today'], ['3d', 'Next 3 days'], ['wknd', 'Weekend outlook'], ['msg', 'Just my message']];
const MA_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], MA_DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MA_EMO = ['🔔', '🧥', '😎', '💨', '😷', '🌙', '☔', '❄️', '🥵', '⚡', '🏈', '🚲'];
const maU = (k, u) => k === 't' ? '°' + (u === 'C' ? 'C' : 'F') : k === 'w' ? (u === 'C' ? ' km/h' : ' mph') : k === 'p' ? (u === 'C' ? ' mm' : ' in') : k === 's' ? (u === 'C' ? ' cm' : ' in') : k === '%' ? '%' : '';
const maId = () => Math.random().toString(36).slice(2, 9);
const isF = () => S().unit !== 'C';
const MA_EVS = [15, 30, 60];
const MA_PRESETS = [
  { key: 'live', label: '⏱️ Every 15 min update', make: () => ({ n: 'Live updates', e: '⏱️', k: 'i', ev: 15, h: ['07:00', '22:00'], d: [0, 1, 2, 3, 4, 5, 6], buzz: false }) },
  { key: 'hoodie', label: '🧥 Hoodie weather (<50°)', make: () => ({ n: 'Hoodie weather', e: '🧥', k: 'c', c: [{ m: 'temp', o: 'lt', v: isF() ? 50 : 10 }], w: 'now', r: 'day', h: ['07:00', '22:00'] }) },
  { key: 'nice', label: '😎 Nice day (65–80° & dry)', make: () => ({ n: 'Nice day', e: '😎', k: 'c', c: [{ m: 'temp', o: 'btw', v: isF() ? 65 : 18, v2: isF() ? 80 : 27 }, { m: 'rain', o: 'lt', v: 20 }], w: 'today', r: 'day', h: ['07:00', '22:00'] }) },
  { key: 'windy', label: '💨 Windy (gusts >25 mph)', make: () => ({ n: 'Windy', e: '💨', k: 'c', c: [{ m: 'gust', o: 'gt', v: isF() ? 25 : 40 }], w: 'h3', r: 'flip', h: ['07:00', '22:00'] }) },
  { key: 'air', label: '😷 Bad air (AQI >100)', make: () => ({ n: 'Bad air', e: '😷', k: 'c', c: [{ m: 'aqi', o: 'gt', v: 100 }], w: 'now', r: 'day', h: ['07:00', '22:00'] }) },
  { key: 'tonight', label: "🌙 Tonight's forecast 9 PM", make: () => ({ n: "Tonight's forecast", e: '🌙', k: 's', t: '21:00', d: [0, 1, 2, 3, 4, 5, 6], s: 'tonight' }) },
  { key: 'tomorrow', label: "📅 Tomorrow's forecast 8 PM", make: () => ({ n: "Tomorrow's forecast", e: '📅', k: 's', t: '20:00', d: [0, 1, 2, 3, 4, 5, 6], s: 'tom' }) },
  { key: 'weekend', label: '🏈 Weekend outlook Fri 5 PM', make: () => ({ n: 'Weekend outlook', e: '🏈', k: 's', t: '17:00', d: [5], s: 'wknd' }) },
  { key: 'snow', label: '❄️ Snow tomorrow', make: () => ({ n: 'Snow tomorrow', e: '❄️', k: 'c', c: [{ m: 'snow', o: 'gt', v: isF() ? 0.5 : 1 }], w: 'tom', r: 'day', h: ['07:00', '22:00'] }) }
];
const t12 = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`; };
const daysTxt = d => { const s = [...(d || [])].sort().join(''); return s === '0123456' ? 'Every day' : s === '12345' ? 'Weekdays' : s === '06' ? 'Weekends' : !s ? 'No days picked' : (d || []).slice().sort().map(i => MA_DAYN[i]).join(', '); };
const MA_SHORT = { temp: 'Temp', feels: 'Feels', wind: 'Wind', gust: 'Gusts', rain: 'Rain', precip: 'Rain amt', snow: 'Snow', uv: 'UV', aqi: 'AQI', hum: 'Humidity', dew: 'Dew pt', cloud: 'Clouds' };
function condTxt(c, u, short) {
  const m = MA_M[c.m]; if (!m) return '?';
  const un = short && m[2] === 't' ? '°' : maU(m[2], u);
  return `${short ? MA_SHORT[c.m] : m[1]} ${c.o === 'gt' ? '>' : c.o === 'lt' ? '<' : ''}${c.o === 'btw' ? `${c.v}–${c.v2}` : c.v}${un}`;
}
function maSummary(a) {
  if (a.k === 'i') return `Every ${a.ev || 15} min · ${t12((a.h || [])[0] || '07:00')}–${t12((a.h || [])[1] || '22:00')} · ${daysTxt(a.d)}`;
  if (a.k === 's') return `${t12(a.t)} · ${daysTxt(a.d)} · ${(MA_SEND.find(x => x[0] === a.s) || [, ''])[1]}`;
  return `${(a.c || []).map(c => condTxt(c, a.u, true)).join(' & ')} · ${MA_WIN_SHORT[a.w] || ''} · ${a.r === 'flip' ? 'every time' : 'once a day'}`;
}
let maList = Array.isArray(P.custom) ? P.custom : [];
let maT;
function maStatus(msg, kind) { const el = $('#maStatus'); if (!el) return; el.textContent = msg; el.className = 'text-xs mt-2 ' + (kind === 'ok' ? 'text-emerald-400' : kind === 'warn' ? 'text-amber-400' : 'text-zinc-400'); }
const pushIsOn = () => P.on && pushSupported() && Notification.permission === 'granted';
function maSave(quiet) {
  P.custom = maList; lsSet('push', P); saveConfig(); renderAlerts();
  clearTimeout(maT);
  if (!pushIsOn()) { if (!quiet) maStatus('Saved on this phone. Turn on notifications above to start getting them.', 'warn'); return Promise.resolve(false); }
  return new Promise(res => { maT = setTimeout(() => publish('sub').then(() => { if (!quiet) maStatus('Saved and synced ✅', 'ok'); res(true); }).catch(e => { maStatus('Saved on this phone. Couldn\'t sync yet (' + (e.message || e) + '), will retry when you reopen the app.', 'warn'); P.lastPost = 0; lsSet('push', P); res(false); }), 500); });
}
async function maTest(id) {
  const a = maList.find(x => x.id === id); if (!a) return;
  if (!pushIsOn()) { maStatus('Turn on notifications above first, then tap Test.', 'warn'); return; }
  maStatus('Sending test…');
  try { clearTimeout(maT); await publish('test', { testAlert: id }); maStatus(`Test sent 🧪 "${a.n}" pops up in about a minute${a.k === 'c' ? ', and it says whether it would go off right now' : ''}.`, 'ok'); }
  catch (e) { maStatus('Test failed: ' + (e.message || e), 'warn'); }
}
function renderAlerts() {
  const box = $('#maList'); if (!box) return;
  const have = new Set(maList.map(a => a.preset).filter(Boolean));
  $('#maPresets').innerHTML = MA_PRESETS.map(p => `<button class="chip-btn ma-preset${have.has(p.key) ? ' added' : ''}" data-p="${p.key}" ${have.has(p.key) ? 'aria-disabled="true"' : ''}>${have.has(p.key) ? '<i class="ph-bold ph-check text-emerald-400"></i>' : '<i class="ph-bold ph-plus"></i>'} ${esc(p.label)}</button>`).join('');
  box.innerHTML = maList.length ? maList.map(a => `<div class="ma-row${a.on === false ? ' off' : ''}" data-id="${esc(a.id)}">
      <button class="ma-main" data-edit="${esc(a.id)}" aria-label="Edit ${esc(a.n)}"><span class="ma-emo">${esc(a.e || '🔔')}</span><span class="min-w-0 flex-1 text-left"><span class="block text-sm font-semibold text-zinc-200 truncate">${esc(a.n || 'My alert')}</span><span class="block text-xs text-zinc-500 truncate">${esc(maSummary(a))}</span></span></button>
      <button class="ma-ico" data-test="${esc(a.id)}" aria-label="Test ${esc(a.n)}" title="Test this alert"><i class="ph ph-paper-plane-tilt"></i></button>
      <input type="checkbox" class="nsw" data-tog="${esc(a.id)}" ${a.on !== false ? 'checked' : ''} aria-label="${esc(a.n)} on/off">
    </div>`).join('') : `<p class="text-xs text-zinc-500 ma-empty">No alerts yet. Tap a preset above or <b class="text-zinc-300">New alert</b>.</p>`;
  try { renderLive(); } catch (e) { console.warn('live', e); }
  $('#maCount').textContent = maList.length ? `${maList.filter(a => a.on !== false).length}/${maList.length} on` : '';
}
function addPreset(key) {
  const p = MA_PRESETS.find(x => x.key === key); if (!p) return;
  if (maList.some(a => a.preset === key)) { const a = maList.find(x => x.preset === key); if (key === 'live' && a.on === false) { a.on = true; maSave(true).then(ok => maStatus(ok ? 'Live updates back on ✅' : 'Turned on. Turn on notifications above to get them.', ok ? 'ok' : 'warn')); return; } openEditor(a.id); return; }
  if (maList.length >= 20) { maStatus('That\'s 20 alerts, the max. Delete one first.', 'warn'); return; }
  const a = { id: maId(), on: true, u: S().unit === 'C' ? 'C' : 'F', preset: key, msg: '', ...p.make() };
  maList.push(a); maSave(true).then(ok => maStatus(ok ? `Added "${a.n}" ✅ Tap it to tweak, or ✈ to test.` : `Added "${a.n}". Turn on notifications above to get it.`, ok ? 'ok' : 'warn'));
}
/* editor sheet */
let draft = null;
function openEditor(id) {
  const a = id ? maList.find(x => x.id === id) : null;
  draft = a ? JSON.parse(JSON.stringify(a)) : { id: maId(), on: true, u: S().unit === 'C' ? 'C' : 'F', n: '', e: '🔔', k: 'c', c: [{ m: 'temp', o: 'lt', v: isF() ? 50 : 10 }], w: 'now', r: 'day', h: ['07:00', '22:00'], t: '21:00', d: [0, 1, 2, 3, 4, 5, 6], s: 'tonight', ev: 15, buzz: false, msg: '' };
  draft._new = !a;
  draft.c ||= [{ m: 'temp', o: 'lt', v: isF() ? 50 : 10 }]; draft.w ||= 'now'; draft.r ||= 'day'; draft.h ||= ['07:00', '22:00'];
  draft.t ||= '21:00'; draft.d ||= [0, 1, 2, 3, 4, 5, 6]; draft.s ||= 'tonight'; draft.ev ||= 15; draft.buzz = !!draft.buzz;
  renderEditor();
  const sh = $('#maSheet'); sh.classList.remove('hidden'); sh.classList.add('flex'); document.body.style.overflow = 'hidden';
  setTimeout(() => { const n = $('#maName'); if (n && draft._new) n.focus({ preventScroll: true }); }, 50);
}
function closeEditor() { const sh = $('#maSheet'); sh.classList.add('hidden'); sh.classList.remove('flex'); document.body.style.overflow = ''; draft = null; }
function readEditor() {
  if (!draft) return;
  draft.n = ($('#maName').value || '').trim().slice(0, 40); draft.e = ($('#maEmoji').value || '').trim().slice(0, 8) || '🔔';
  draft.msg = ($('#maMsg').value || '').trim().slice(0, 160);
  if (draft.k === 'c') {
    draft.c = [...document.querySelectorAll('.ma-cond')].map(r => {
      const c = { m: r.querySelector('.ma-m').value, o: r.querySelector('.ma-o').value, v: parseFloat(r.querySelector('.ma-v').value) };
      if (c.o === 'btw') c.v2 = parseFloat(r.querySelector('.ma-v2').value);
      return c;
    });
    draft.w = $('#maWin').value; draft.r = $('#maRe').value; draft.h = [$('#maH1').value || '07:00', $('#maH2').value || '22:00'];
  } else if (draft.k === 'i') {
    const ev = document.querySelector('#maBody [data-ev].on'); if (ev) draft.ev = +ev.dataset.ev;
    draft.h = [$('#maH1').value || '07:00', $('#maH2').value || '22:00']; draft.buzz = !!($('#maBuzz') || {}).checked;
  } else { draft.t = $('#maTime').value || '21:00'; draft.s = $('#maSend').value; }
}
function condRow(c, i, n) {
  const m = MA_M[c.m] || MA_MET[0];
  const opts = MA_MET.map(x => `<option value="${x[0]}" ${x[0] === c.m ? 'selected' : ''}>${x[1]}</option>`).join('');
  const un = esc(maU(m[2], draft.u));
  return `<div class="ma-cond" data-i="${i}">
    <div class="flex gap-2"><select class="ma-in ma-m flex-1" aria-label="What to watch">${opts}</select>
    <select class="ma-in ma-o" aria-label="Above or below"><option value="gt" ${c.o === 'gt' ? 'selected' : ''}>above</option><option value="lt" ${c.o === 'lt' ? 'selected' : ''}>below</option><option value="btw" ${c.o === 'btw' ? 'selected' : ''}>between</option></select></div>
    <div class="flex gap-2 items-center mt-2"><input class="ma-in ma-v w-24" type="number" inputmode="decimal" step="${m[5]}" value="${esc(c.v ?? '')}" aria-label="Value">
    ${c.o === 'btw' ? `<span class="text-zinc-500 text-sm">and</span><input class="ma-in ma-v2 w-24" type="number" inputmode="decimal" step="${m[5]}" value="${esc(c.v2 ?? '')}" aria-label="Second value">` : ''}
    <span class="text-sm text-zinc-400">${un}</span><span class="flex-1"></span>
    ${n > 1 ? `<button class="ma-ico ma-rm" data-rm="${i}" aria-label="Remove this condition"><i class="ph ph-x"></i></button>` : ''}</div>
  </div>`;
}
function renderEditor() {
  const d = draft, cond = d.k === 'c', live = d.k === 'i';
  const dayPick = `<p class="ma-lbl">Days</p>
      <div class="flex gap-1.5 justify-between">${MA_DAYS.map((x, i) => `<button class="ma-day ${d.d.includes(i) ? 'on' : ''}" data-day="${i}" aria-pressed="${d.d.includes(i)}" aria-label="${MA_DAYN[i]}">${x}</button>`).join('')}</div>
      <div class="flex gap-3 mt-2 text-xs font-semibold"><button class="text-blue-400" data-days="0123456">Every day</button><button class="text-blue-400" data-days="12345">Weekdays</button><button class="text-blue-400" data-days="06">Weekends</button></div>`;
  $('#maTitle').textContent = d._new ? 'New alert' : 'Edit alert';
  $('#maBody').innerHTML = `
    <div class="flex gap-2"><input id="maEmoji" class="ma-in w-14 text-center text-lg" value="${esc(d.e)}" maxlength="8" aria-label="Emoji">
      <input id="maName" class="ma-in flex-1" value="${esc(d.n)}" maxlength="40" placeholder="Name it (e.g. Hoodie weather)" aria-label="Alert name"></div>
    <div class="flex gap-1.5 mt-2 overflow-x-auto ma-scroll">${MA_EMO.map(x => `<button class="ma-emopick" data-emo="${x}" aria-label="Use ${x}">${x}</button>`).join('')}</div>
    <div class="seg ma-kinds mt-4" role="tablist"><button class="flex-1 !py-2 ${cond ? 'on' : ''}" data-kind="c"><i class="ph-bold ph-thermometer-simple"></i> Weather</button><button class="flex-1 !py-2 ${d.k === 's' ? 'on' : ''}" data-kind="s"><i class="ph-bold ph-alarm"></i> Set time</button><button class="flex-1 !py-2 ${live ? 'on' : ''}" data-kind="i"><i class="ph-bold ph-repeat"></i> Repeat</button></div>
    ${live ? `
      <p class="ma-lbl">Send current conditions every</p>
      <div class="seg w-full">${MA_EVS.map(v => `<button class="flex-1 !py-2 ${+d.ev === v ? 'on' : ''}" data-ev="${v}">${v} min</button>`).join('')}</div>
      <p class="ma-lbl">Only between</p>
      <div class="flex items-center gap-2"><input id="maH1" type="time" class="ma-in flex-1" value="${esc(d.h[0])}" aria-label="From"><span class="text-zinc-500 text-sm">and</span><input id="maH2" type="time" class="ma-in flex-1" value="${esc(d.h[1])}" aria-label="To"></div>
      ${dayPick}
      <label class="flex items-center gap-3 mt-4"><span class="flex-1"><span class="block text-sm font-semibold text-zinc-200">Buzz each time</span><span class="block text-xs text-zinc-500">Off = it quietly refreshes the same notification</span></span><input id="maBuzz" type="checkbox" class="nsw" ${d.buzz ? 'checked' : ''} aria-label="Buzz each time"></label>
    ` : cond ? `
      <p class="ma-lbl">Send it when</p>
      <div class="flex flex-col gap-2" id="maConds">${d.c.map((c, i) => condRow(c, i, d.c.length)).join('<p class="text-[11px] font-bold text-zinc-500 text-center tracking-widest">AND</p>')}</div>
      ${d.c.length < 3 ? `<button id="maAddC" class="text-blue-400 text-xs font-semibold mt-2"><i class="ph-bold ph-plus"></i> Add another condition</button>` : ''}
      <p class="ma-lbl">When</p>
      <select id="maWin" class="ma-in w-full">${MA_WIN.map(w => `<option value="${w[0]}" ${w[0] === d.w ? 'selected' : ''}>${w[1]}</option>`).join('')}</select>
      <p class="ma-lbl">How often</p>
      <select id="maRe" class="ma-in w-full"><option value="day" ${d.r !== 'flip' ? 'selected' : ''}>Once a day max</option><option value="flip" ${d.r === 'flip' ? 'selected' : ''}>Every time it starts (max once an hour)</option></select>
      <p class="ma-lbl">Only between</p>
      <div class="flex items-center gap-2"><input id="maH1" type="time" class="ma-in flex-1" value="${esc(d.h[0])}" aria-label="From"><span class="text-zinc-500 text-sm">and</span><input id="maH2" type="time" class="ma-in flex-1" value="${esc(d.h[1])}" aria-label="To"></div>
      <p class="text-[11px] text-zinc-500 mt-1">So it doesn't buzz you at 3 AM.</p>
    ` : `
      <p class="ma-lbl">Time</p>
      <input id="maTime" type="time" class="ma-in w-full" value="${esc(d.t)}" aria-label="Time">
      ${dayPick}
      <p class="ma-lbl">What to send</p>
      <select id="maSend" class="ma-in w-full">${MA_SEND.map(w => `<option value="${w[0]}" ${w[0] === d.s ? 'selected' : ''}>${w[1]}</option>`).join('')}</select>
    `}
    <p class="ma-lbl">Your message <span class="font-normal text-zinc-500">(optional)</span></p>
    <input id="maMsg" class="ma-in w-full" value="${esc(d.msg || '')}" maxlength="160" placeholder="${cond ? 'e.g. Grab a hoodie!' : live ? 'Added under the weather' : 'e.g. Charge your phone 🔋'}" aria-label="Your message">
    <p class="ma-preview" id="maPrev"></p>`;
  maPreview();
  const body = $('#maBody');
  body.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { readEditor(); draft.k = b.dataset.kind; renderEditor(); });
  body.querySelectorAll('[data-emo]').forEach(b => b.onclick = () => { $('#maEmoji').value = b.dataset.emo; maPreview(); });
  body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { readEditor(); const i = +b.dataset.day; draft.d = draft.d.includes(i) ? draft.d.filter(x => x !== i) : [...draft.d, i].sort(); renderEditor(); });
  body.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { readEditor(); draft.d = b.dataset.days.split('').map(Number); renderEditor(); });
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { readEditor(); draft.c.splice(+b.dataset.rm, 1); renderEditor(); });
  body.querySelectorAll('.ma-m').forEach(sel => sel.onchange = () => { readEditor(); const i = +sel.closest('.ma-cond').dataset.i, m = MA_M[sel.value]; draft.c[i].v = draft.u === 'C' ? m[4] : m[3]; if (draft.c[i].o === 'btw') draft.c[i].v2 = +(draft.c[i].v + m[5] * 10).toFixed(2); renderEditor(); });
  body.querySelectorAll('.ma-o').forEach(sel => sel.onchange = () => { readEditor(); const i = +sel.closest('.ma-cond').dataset.i, m = MA_M[draft.c[i].m]; if (sel.value === 'btw' && !isFinite(draft.c[i].v2)) draft.c[i].v2 = +((draft.c[i].v || 0) + m[5] * 10).toFixed(2); renderEditor(); });
  body.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { readEditor(); draft.ev = +b.dataset.ev; renderEditor(); });
  const add = $('#maAddC'); if (add) add.onclick = () => { readEditor(); draft.c.push({ m: 'rain', o: 'lt', v: 20 }); renderEditor(); };
  body.querySelectorAll('input,select').forEach(el => el.addEventListener('input', maPreview));
  $('#maDel').classList.toggle('hidden', !!draft._new);
}
function maPreview() {
  readEditor(); const d = draft, el = $('#maPrev'); if (!el) return;
  let t;
  if (d.k === 'c') t = `Pings you when ${(d.c || []).map(c => condTxt(c, d.u).toLowerCase()).join(' and ')} ${({ now: 'right now', h3: 'in the next 3 hours', h6: 'in the next 6 hours', h12: 'in the next 12 hours', today: 'later today', tom: 'tomorrow (heads-up after 5 PM)' })[d.w]}, ${d.r === 'flip' ? 'every time it starts' : 'once a day max'}, ${t12(d.h[0])}–${t12(d.h[1])}.`;
  else if (d.k === 'i') t = `Every ${d.ev} min, ${t12(d.h[0])}–${t12(d.h[1])}, ${daysTxt(d.d).toLowerCase()}: temp, feels like, sky, rain chance next hour and wind. ${d.buzz ? 'Buzzes each time.' : 'Updates the same notification quietly, no pile-up.'}`;
  else t = `Pings you at ${t12(d.t)}, ${daysTxt(d.d).toLowerCase()}, with ${(MA_SEND.find(x => x[0] === d.s) || [, ''])[1].toLowerCase()}.`;
  el.innerHTML = `<i class="ph-fill ph-info text-blue-400"></i> ${esc(t)}`;
}
function validDraft() {
  const d = draft;
  if (!d.n && d.k === 'i') d.n = d.ev === 15 ? 'Live updates' : `Every ${d.ev} min update`;
  if (!d.n) d.n = d.k === 's' ? `${(MA_SEND.find(x => x[0] === d.s) || [, 'My alert'])[1]} ${t12(d.t)}` : (MA_M[d.c[0]?.m]?.[1] || 'My alert') + ' alert';
  if (d.k === 'c') {
    for (const c of d.c) if (!isFinite(c.v) || (c.o === 'btw' && !isFinite(c.v2))) return 'Put a number in every box.';
  } else if (!d.d.length) return 'Pick at least one day.';
  if (d.k === 'i' && d.h[0] === d.h[1]) { /* same start + end = all day, that's allowed */ }
  if (d.k === 's' && d.s === 'msg' && !d.msg) return 'Type the message you want to get.';
  return '';
}
function commitDraft() {
  readEditor(); const err = validDraft(); if (err) { const e = $('#maErr'); e.textContent = err; e.classList.remove('hidden'); return null; }
  const a = { ...draft }; delete a._new;
  if (a.k === 'c') { delete a.t; delete a.d; delete a.s; } else if (a.k === 'i') { delete a.c; delete a.w; delete a.r; delete a.t; delete a.s; } else { delete a.c; delete a.w; delete a.r; delete a.h; }
  if (a.k !== 'i') { delete a.ev; delete a.buzz; }
  if (!a.msg) delete a.msg;
  const i = maList.findIndex(x => x.id === a.id);
  if (i >= 0) { if (maList[i].preset && JSON.stringify(maList[i]) !== JSON.stringify(a)) a.preset = maList[i].preset; maList[i] = a; }
  else { if (maList.length >= 20) { const e = $('#maErr'); e.textContent = 'That\'s 20 alerts, the max. Delete one first.'; e.classList.remove('hidden'); return null; } maList.push(a); }
  return a;
}
function initAlerts() {
  if (!$('#maList')) return;
  const sheet = document.createElement('div');
  sheet.id = 'maSheet'; sheet.className = 'ma-sheet hidden'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'maTitle');
  sheet.innerHTML = `<div class="ma-panel">
    <div class="flex items-center justify-between mb-3"><h3 id="maTitle" class="text-base font-bold text-zinc-100">New alert</h3><button id="maX" class="ma-ico" aria-label="Close"><i class="ph ph-x"></i></button></div>
    <div id="maBody"></div>
    <p id="maErr" class="hidden text-xs text-amber-400 mt-3"></p>
    <div class="flex flex-wrap gap-2 mt-4"><button id="maSaveBtn" class="btn-primary !py-2.5 !px-5 flex-1 flex items-center justify-center gap-2"><i class="ph-bold ph-check"></i> Save</button><button id="maTestBtn" class="btn-soft"><i class="ph ph-paper-plane-tilt"></i> Save + test</button></div>
    <button id="maDel" class="w-full text-center text-xs font-semibold text-red-400 mt-4 py-2"><i class="ph ph-trash"></i> Delete this alert</button>
  </div>`;
  document.body.appendChild(sheet);
  sheet.onclick = e => { if (e.target === sheet) closeEditor(); };
  $('#maX').onclick = closeEditor;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && draft) closeEditor(); });
  $('#maSaveBtn').onclick = () => { const a = commitDraft(); if (!a) return; closeEditor(); maSave(); };
  $('#maTestBtn').onclick = async () => { const a = commitDraft(); if (!a) return; closeEditor(); await maSave(true); maTest(a.id); };
  $('#maDel').onclick = () => { if (!draft) return; const n = draft.n || 'this alert'; if (!confirm(`Delete "${n}"?`)) return; maList = maList.filter(x => x.id !== draft.id); closeEditor(); maSave(true).then(() => maStatus(`Deleted "${n}".`, 'ok')); };
  $('#maNew').onclick = () => { if (maList.length >= 20) { maStatus('That\'s 20 alerts, the max. Delete one first.', 'warn'); return; } openEditor(null); };
  $('#maPresets').onclick = e => { const b = e.target.closest('[data-p]'); if (b) addPreset(b.dataset.p); };
  $('#maList').onclick = e => {
    const ed = e.target.closest('[data-edit]'), ts = e.target.closest('[data-test]');
    if (ed) openEditor(ed.dataset.edit); else if (ts) maTest(ts.dataset.test);
  };
  $('#maList').onchange = e => { const t = e.target.closest('[data-tog]'); if (!t) return; const a = maList.find(x => x.id === t.dataset.tog); if (!a) return; a.on = t.checked; maSave(true).then(ok => maStatus(`${a.n} is ${a.on ? 'on' : 'off'}${ok ? ' ✅' : ''}.`, ok ? 'ok' : 'warn')); };
  renderAlerts();
}

/* ---------- Live updates: one-tap card in the Notifications panel (it's the "Every 15 min update" alert in My alerts) ---------- */
const liveA = () => maList.find(a => a.preset === 'live') || null;
function liveStatus(msg, kind) { const el = $('#liveStatus'); if (!el) return; el.textContent = msg; el.className = 'text-xs mt-2 ' + (kind === 'ok' ? 'text-emerald-400' : kind === 'warn' ? 'text-amber-400' : 'text-zinc-400'); }
function renderLive() {
  const box = $('#liveBox'); if (!box) return;
  const a = liveA(), on = !!a && a.on !== false;
  const h = (a && a.h) || ['07:00', '22:00'], d = (a && a.d) || [0, 1, 2, 3, 4, 5, 6], ev = (a && a.ev) || 15;
  box.innerHTML = `<label class="ntype live-row"><i class="ph-fill ph-broadcast text-emerald-400 text-xl"></i><span class="flex-1 min-w-0"><span class="block text-sm font-semibold text-zinc-200">Live updates <span class="nbadge on ml-1">NEW</span></span><span class="block text-xs text-zinc-500">${on ? esc(`Every ${ev} min · ${t12(h[0])}–${t12(h[1])} · ${daysTxt(d)}`) : 'Temp, feels like, rain + wind every 15 min. Updates in place, no pile-up.'}</span></span><input type="checkbox" class="nsw" id="liveTog" ${on ? 'checked' : ''} aria-label="Live updates on or off"></label>
  ${on ? `<div class="live-opts">
    <div class="seg w-full" role="group" aria-label="How often">${MA_EVS.map(v => `<button class="flex-1 !py-1.5 ${ev === v ? 'on' : ''}" data-lev="${v}" aria-pressed="${ev === v}">${v} min</button>`).join('')}</div>
    <div class="flex items-center gap-2 mt-3"><span class="text-xs text-zinc-400">From</span><input id="liveH1" type="time" class="ma-in live-time flex-1" value="${esc(h[0])}" aria-label="Live updates start time"><span class="text-xs text-zinc-400">to</span><input id="liveH2" type="time" class="ma-in live-time flex-1" value="${esc(h[1])}" aria-label="Live updates end time"></div>
    <div class="flex gap-1 justify-between mt-3">${MA_DAYS.map((x, i) => `<button class="ma-day live-day ${d.includes(i) ? 'on' : ''}" data-lday="${i}" aria-pressed="${d.includes(i)}" aria-label="${MA_DAYN[i]}">${x}</button>`).join('')}</div>
    <div class="flex items-center gap-3 mt-3"><label class="flex items-center gap-2 flex-1 text-xs text-zinc-300 cursor-pointer"><input type="checkbox" class="nsw" id="liveBuzz" ${a.buzz ? 'checked' : ''} aria-label="Buzz each time"> Buzz each time</label><button class="btn-soft !py-1.5 !px-3 !text-xs" id="liveTest"><i class="ph ph-paper-plane-tilt"></i> Test</button></div>
  </div>` : ''}`;
}
function liveEdit(fn, msg) {
  let a = liveA();
  if (!a) { if (maList.length >= 20) { liveStatus('You have 20 alerts, the max. Delete one in My alerts first.', 'warn'); renderLive(); return; } a = { id: maId(), on: true, u: S().unit === 'C' ? 'C' : 'F', preset: 'live', ...MA_PRESETS[0].make() }; maList.unshift(a); }
  fn(a);
  if (a.on !== false && !pushIsOn()) {
    P.custom = maList; lsSet('push', P); renderAlerts();
    liveStatus('Turning on notifications…');
    enablePush().then(() => liveStatus(pushIsOn() ? `Live updates on ✅ First one lands within ${a.ev || 15} min.` : 'Saved. Allow notifications to get them.', pushIsOn() ? 'ok' : 'warn'));
    return;
  }
  maSave(true).then(ok => liveStatus(ok ? (typeof msg === 'function' ? msg(a) : msg) : 'Saved on this phone. Turn on notifications above to get them.', ok ? 'ok' : 'warn'));
}
function initLive() {
  const box = $('#liveBox'); if (!box) return;
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-lev],[data-lday],#liveTest'); if (!b) return;
    e.preventDefault();
    if (b.id === 'liveTest') { const a = liveA(); if (!a) return; if (!pushIsOn()) { liveStatus('Turn on notifications first, then tap Test.', 'warn'); return; }
      liveStatus('Sending test…'); clearTimeout(maT); publish('test', { testAlert: a.id }).then(() => liveStatus('Test sent 🧪 Your live update pops up in about a minute.', 'ok')).catch(err => liveStatus('Test failed: ' + (err.message || err), 'warn')); return; }
    if (b.dataset.lev) liveEdit(a => { a.ev = +b.dataset.lev; }, a => `Every ${a.ev} min ✅`);
    else { const i = +b.dataset.lday; liveEdit(a => { const d = Array.isArray(a.d) ? a.d : [0, 1, 2, 3, 4, 5, 6]; const nd = d.includes(i) ? d.filter(x => x !== i) : [...d, i].sort(); if (nd.length) a.d = nd; }, a => `${daysTxt(a.d)} ✅`); }
  });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'liveTog') liveEdit(a => { a.on = t.checked; }, a => a.on ? `Live updates on ✅ Every ${a.ev || 15} min, ${t12(a.h[0])}–${t12(a.h[1])}.` : 'Live updates off.');
    else if (t.id === 'liveBuzz') liveEdit(a => { a.buzz = t.checked; }, a => a.buzz ? 'It\'ll buzz each time ✅' : 'Quiet updates ✅ It refreshes in place without buzzing again.');
    else if (t.id === 'liveH1' || t.id === 'liveH2') liveEdit(a => { a.h = [$('#liveH1').value || '07:00', $('#liveH2').value || '22:00']; }, a => `Between ${t12(a.h[0])} and ${t12(a.h[1])} ✅`);
  });
  renderLive();
}

/* ---------- boot ---------- */
function boot() {
  initPWA(); bindShareCard(); jump();
  try { initAlerts(); } catch (e) { console.warn('my alerts', e); }
  try { initLive(); } catch (e) { console.warn('live updates', e); }
  window.addEventListener('hashchange', jump);
  let first = true;
  document.addEventListener('nx:data', () => {
    try { renderSun(); } catch (e) { console.warn('sun', e); }
    loadNowcast();
    if (first) { first = false; renderPush(); refreshPush(); } else renderPush();
  });
  setInterval(() => { try { renderSun(); } catch {} }, 60000);
  if (!pushSupported()) status('Push needs Chrome or Edge (Android/desktop). On iPhone, add to Home Screen first.', 'warn');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

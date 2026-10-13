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
    unit: S().unit, prefs: { alerts: P.alerts, rain: P.rain, morning: P.morning, morningTime: P.morningTime, temp: P.temp, every: P.every || 15 },
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
    status('Sent ✅ You should see one now. A real push from the server lands within ~15–30 min (GitHub runs it on a timer).', 'ok');
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

/* ---------- boot ---------- */
function boot() {
  initPWA(); bindShareCard(); jump();
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

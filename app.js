/* NEXUS Ultimate: merged from NEXUS, OmniWeather (Marina), AtmosDash (SkyCastPro) and Skyglass (Weahter-). Keyless APIs only. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls = (k, d) => { try { const v = localStorage.getItem('nx_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('nx_' + k, JSON.stringify(v)); } catch {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => (v == null || isNaN(v)) ? null : +v;

const S = {
  unit: ls('unit', 'F'), model: ls('model', 'best_match'), theme: ls('theme', 'dark'),
  loc: null, saved: ls('saved', []), days: 14,
  D: null, AQ: null, MR: null, LY: null, MC: null, KP: null, NWS: null, ALERTS: [], chat: [], updated: null
};
window.state = S;
window.NX = { get S() { return S; }, F: () => S.unit === 'F', toast: m => toast(m), reload: () => loadAll(false) };
const F = () => S.unit === 'F';
const tU = () => F() ? '°F' : '°C';
const wU = () => F() ? 'mph' : 'km/h';
const pU = () => F() ? 'in' : 'mm';
const r0 = v => v == null ? '--' : Math.round(v);
const deg = v => v == null ? '--°' : Math.round(v) + '°';
const toF = c => c * 9 / 5 + 32;
const tempC = v => F() ? (v - 32) * 5 / 9 : v;
const dirName = d => d == null ? '--' : ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d / 22.5) % 16];

const WX = {0:['Clear sky','sun','moon'],1:['Mainly clear','sun','moon-stars'],2:['Partly cloudy','cloud-sun','cloud-moon'],3:['Overcast','cloud','cloud'],45:['Fog','cloud-fog','cloud-fog'],48:['Rime fog','cloud-fog','cloud-fog'],51:['Light drizzle','cloud-rain','cloud-rain'],53:['Drizzle','cloud-rain','cloud-rain'],55:['Heavy drizzle','cloud-rain','cloud-rain'],56:['Freezing drizzle','cloud-snow','cloud-snow'],57:['Freezing drizzle','cloud-snow','cloud-snow'],61:['Light rain','cloud-rain','cloud-rain'],63:['Rain','cloud-rain','cloud-rain'],65:['Heavy rain','cloud-rain','cloud-rain'],66:['Freezing rain','cloud-snow','cloud-snow'],67:['Freezing rain','cloud-snow','cloud-snow'],71:['Light snow','snowflake','snowflake'],73:['Snow','snowflake','snowflake'],75:['Heavy snow','snowflake','snowflake'],77:['Snow grains','snowflake','snowflake'],80:['Rain showers','cloud-rain','cloud-rain'],81:['Rain showers','cloud-rain','cloud-rain'],82:['Violent showers','cloud-rain','cloud-rain'],85:['Snow showers','snowflake','snowflake'],86:['Snow showers','snowflake','snowflake'],95:['Thunderstorm','cloud-lightning','cloud-lightning'],96:['T-storm with hail','cloud-lightning','cloud-lightning'],99:['T-storm with hail','cloud-lightning','cloud-lightning']};
const wx = (c, day = 1) => { const w = WX[c] || ['--', 'cloud', 'cloud']; return { text: w[0], icon: 'ph-' + (day ? w[1] : w[2]) }; };
const iconColor = c => c == null ? 'text-zinc-400' : c <= 1 ? 'text-yellow-400' : c <= 3 ? 'text-zinc-300' : c <= 48 ? 'text-zinc-400' : c >= 95 ? 'text-purple-400' : (c >= 71 && c <= 86 && ![80,81,82].includes(c)) ? 'text-sky-200' : 'text-blue-400';

async function getJSON(url, opts = {}, ms = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}
const unitQS = () => F() ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '';

let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 2600); }

/* ---------- gauges ---------- */
let gid = 0;
const PATH = 'M 10 60 A 50 50 0 0 1 110 60'; const LEN = Math.PI * 50;
function arcGauge(el, o) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  const id = 'gr' + (++gid);
  const v = num(o.value);
  const f = v == null ? 0 : clamp((v - o.min) / (o.max - o.min), 0, 1);
  const a = Math.PI * (1 - f), cx = 60 + 50 * Math.cos(a), cy = 60 - 50 * Math.sin(a);
  const stops = (o.stops || ['#3b82f6', '#3b82f6']).map((c, i, arr) => `<stop offset="${arr.length === 1 ? 0 : i / (arr.length - 1) * 100}%" stop-color="${c}"/>`).join('');
  el.innerHTML = `<div class="gauge ${o.small ? 'gauge-sm' : ''} mx-auto" role="img" aria-label="${esc(o.aria || '')}">
    <svg viewBox="0 -8 120 76"><defs><linearGradient id="${id}" x1="0%" x2="100%">${stops}</linearGradient></defs>
      <path d="${PATH}" fill="none" stroke="url(#${id})" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>
      <path d="${PATH}" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round" class="instrument-arc" stroke-dasharray="${LEN}" stroke-dashoffset="${LEN}" data-off="${LEN * (1 - f)}"/>
      ${v == null ? '' : `<circle cx="${cx}" cy="${cy}" r="5.5" fill="#fafafa" stroke="#09090b" stroke-width="2.5"/>`}
    </svg>
    <div class="gval"><span class="gnum">${v == null ? '--' : esc(o.display ?? Math.round(v))}</span><span class="gunit">${esc(o.unit || '')}</span>
      ${o.label ? `<div><span class="glabel" style="color:${o.labelColor || '#a1a1aa'}">${esc(o.label)}</span></div>` : ''}</div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('[data-off]').forEach(p => p.setAttribute('stroke-dashoffset', p.dataset.off))));
}
function compassGauge(el, dir, speed, gust) {
  el = document.getElementById(el); if (!el) return;
  const ticks = Array.from({ length: 36 }, (_, i) => { const a = i * 10 * Math.PI / 180, r1 = i % 9 === 0 ? 38 : 41; return `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + 45 * Math.sin(a)}" y2="${50 - 45 * Math.cos(a)}" stroke="${i % 9 === 0 ? '#71717a' : '#3f3f46'}" stroke-width="${i % 9 === 0 ? 1.6 : 1}"/>`; }).join('');
  const rot = dir == null ? 0 : (dir + 180) % 360;
  el.innerHTML = `<div class="gauge mx-auto" style="max-width:150px" role="img" aria-label="Wind ${r0(speed)} ${wU()} from ${dirName(dir)}"><svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="rgba(9,9,11,.25)" stroke="var(--track)" stroke-width="2"/>${ticks}
    <text x="50" y="18" font-size="8" font-weight="700" fill="#a1a1aa" text-anchor="middle">N</text><text x="50" y="89" font-size="8" font-weight="700" fill="#71717a" text-anchor="middle">S</text>
    <text x="86" y="53" font-size="8" font-weight="700" fill="#71717a" text-anchor="middle">E</text><text x="14" y="53" font-size="8" font-weight="700" fill="#71717a" text-anchor="middle">W</text>
    <g style="transform-origin:50px 50px;transform:rotate(${rot}deg);transition:transform 1s"><path d="M50 9 L57 25 L50 21 L43 25 Z" fill="#2dd4bf" style="filter:drop-shadow(0 0 4px rgba(45,212,191,.6))"/><circle cx="50" cy="86" r="2.5" fill="#2dd4bf" fill-opacity=".5"/></g>
    <text x="50" y="53" font-size="17" font-weight="700" fill="var(--text)" text-anchor="middle">${r0(speed)}</text>
    <text x="50" y="63" font-size="6.5" font-weight="600" fill="#71717a" text-anchor="middle">${wU()} ${dirName(dir)}</text>
  </svg></div>`;
}
function fmtTime(iso) { if (!iso) return '--'; let [h, m] = iso.slice(11, 16).split(':').map(Number); const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')}${ap}`; }
function fmtHour(iso) { let h = +iso.slice(11, 13); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ' ' + ap; }
function sunGauge(el, rise, set, nowISO) {
  el = document.getElementById(el); if (!el || !rise || !set) return;
  const t = s => { const [h, m] = s.slice(11, 16).split(':').map(Number); return h * 60 + m; };
  const n = t(nowISO), a = t(rise), b = t(set);
  const up = n >= a && n <= b, f = clamp((n - a) / (b - a), 0, 1);
  const ang = Math.PI * (1 - f), cx = 60 + 50 * Math.cos(ang), cy = 60 - 50 * Math.sin(ang);
  el.innerHTML = `<div class="gauge mx-auto" role="img" aria-label="Sun position"><svg viewBox="0 -8 120 84">
    <defs><linearGradient id="sung" x1="0" x2="1"><stop offset="0" stop-color="#f97316"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
    <line x1="2" y1="60" x2="118" y2="60" stroke="var(--track)" stroke-width="1.5"/>
    <path d="${PATH}" fill="none" stroke="url(#sung)" stroke-width="2" stroke-dasharray="3 4" stroke-opacity=".7"/>
    ${up ? `<path d="M 10 60 A 50 50 0 0 1 ${cx} ${cy}" fill="none" stroke="url(#sung)" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="7" fill="#facc15" style="filter:drop-shadow(0 0 6px #facc15)"/>` : ''}
    <text x="12" y="73" font-size="8" fill="#a1a1aa" text-anchor="middle">${fmtTime(rise)}</text><text x="108" y="73" font-size="8" fill="#a1a1aa" text-anchor="middle">${fmtTime(set)}</text>
    <text x="60" y="45" font-size="${up ? 11 : 10}" font-weight="700" fill="var(--text)" text-anchor="middle">${up ? Math.round(f * 100) + '%' : 'Sun down'}</text>
    <text x="60" y="55" font-size="6.5" fill="#71717a" text-anchor="middle">${up ? 'of daylight gone' : 'rises ' + fmtTime(rise)}</text>
  </svg></div>`;
}

const GAUGES = [
  ['wind', 'ph-wind', 'text-teal-400', 'Wind'], ['humidity', 'ph-drop-half', 'text-cyan-400', 'Humidity'],
  ['pressure', 'ph-arrows-in-line-vertical', 'text-purple-400', 'Pressure'], ['uv', 'ph-sun-dim', 'text-yellow-500', 'UV Index'],
  ['aqi', 'ph-leaf', 'text-green-400', 'Air Quality'], ['sun', 'ph-sun-horizon', 'text-orange-400', 'Sun Position'],
  ['rain', 'ph-umbrella', 'text-blue-400', 'Rain Chance'], ['feels', 'ph-thermometer', 'text-rose-400', 'Feels Like'],
  ['dew', 'ph-drop', 'text-sky-400', 'Dew Point'], ['vis', 'ph-eye', 'text-indigo-300', 'Visibility'],
  ['cloud', 'ph-cloud', 'text-zinc-300', 'Cloud Cover'], ['moon', 'ph-moon-stars', 'text-slate-300', 'Moon Phase']
];
function buildGaugeGrid() {
  $('#gaugeGrid').innerHTML = GAUGES.map(([k, ic, col, t]) => `<div class="card gcard"><div class="ghead"><i class="ph-fill ${ic} ${col}"></i>${t}</div><div class="gbody" id="g-${k}"></div><div class="gfoot" id="gf-${k}"></div></div>`).join('');
}
const setFoot = (k, h) => { const e = document.getElementById('gf-' + k); if (e) e.innerHTML = h; };
const uvCat = v => v == null ? ['--', '#a1a1aa'] : v < 3 ? ['Low', '#4ade80'] : v < 6 ? ['Moderate', '#facc15'] : v < 8 ? ['High', '#fb923c'] : v < 11 ? ['Very high', '#ef4444'] : ['Extreme', '#a855f7'];
const aqiCat = v => v == null ? ['--', '#a1a1aa'] : v <= 50 ? ['Good', '#4ade80'] : v <= 100 ? ['Moderate', '#facc15'] : v <= 150 ? ['Sensitive', '#fb923c'] : v <= 200 ? ['Unhealthy', '#ef4444'] : v <= 300 ? ['Very unhealthy', '#a855f7'] : ['Hazardous', '#9f1239'];
const dewCat = dF => dF == null ? ['--', '#a1a1aa'] : dF < 50 ? ['Dry', '#38bdf8'] : dF < 60 ? ['Comfortable', '#4ade80'] : dF < 65 ? ['Sticky', '#facc15'] : dF < 70 ? ['Muggy', '#fb923c'] : ['Oppressive', '#ef4444'];
function moonPhase(date = new Date()) {
  const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date - ref) / 864e5) % syn + syn) % syn, f = age / syn;
  const illum = Math.round((1 - Math.cos(2 * Math.PI * f)) / 2 * 100);
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return { name: names[Math.floor((f * 8) + 0.5) % 8], illum, f, age };
}
function moonGauge(el) {
  const m = moonPhase(); el = document.getElementById(el); if (!el) return;
  const k = Math.cos(2 * Math.PI * m.f), waxing = m.f < 0.5, r = 26;
  const rx = Math.abs(k) * r, sweepOuter = waxing ? 1 : 0, sweepInner = (k > 0) === waxing ? 0 : 1;
  const d = `M50 ${36 - r} A ${r} ${r} 0 0 ${sweepOuter} 50 ${36 + r} A ${rx} ${r} 0 0 ${sweepInner} 50 ${36 - r} Z`;
  el.innerHTML = `<div class="gauge mx-auto" style="max-width:150px"><svg viewBox="0 0 100 80"><circle cx="50" cy="36" r="${r}" fill="var(--track)"/><path d="${d}" fill="#e2e8f0" style="filter:drop-shadow(0 0 6px rgba(226,232,240,.35))"/></svg>
  <div class="gval" style="bottom:-2px"><span class="gnum" style="font-size:1rem">${m.illum}%</span><span class="gunit">lit</span></div></div>`;
  setFoot('moon', esc(m.name));
}

/* ---------- location ---------- */
async function reverseName(lat, lon) {
  try {
    const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, {}, 8000);
    const city = d.city || d.locality || d.principalSubdivision || 'Your location';
    const st = (d.principalSubdivisionCode || '').split('-')[1];
    return d.countryCode === 'US' && st ? `${city}, ${st}` : `${city}${d.countryName ? ', ' + d.countryName : ''}`;
  } catch { return 'Your location'; }
}
function getPosition(timeout = 9000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { enableHighAccuracy: false, timeout, maximumAge: 300000 });
  });
}
async function useGPS(silent) {
  try {
    const c = await getPosition();
    const lat = +c.latitude.toFixed(4), lon = +c.longitude.toFixed(4);
    const name = await reverseName(lat, lon);
    await setLocation({ lat, lon, name, gps: true });
    if (!silent) toast('Using your location: ' + name);
    return true;
  } catch (e) {
    if (!silent) toast('Location is blocked. Search a city instead.');
    return false;
  }
}
async function setLocation(loc) {
  S.loc = loc; lsSet('last', loc);
  renderSaved();
  await loadAll(true);
}

/* ---------- search ---------- */
const STATES = {Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC'};
const stAbbr = s => STATES[s] || s;
let sT;
function bindSearch() {
  const inp = $('#searchInput'), box = $('#searchResults');
  const close = () => { box.classList.add('hidden'); box.classList.remove('flex'); };
  inp.addEventListener('input', () => { clearTimeout(sT); const q = inp.value.trim(); if (q.length < 2) return close(); sT = setTimeout(() => search(q), 300); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const first = box.querySelector('button'); if (first && !box.classList.contains('hidden')) first.click(); else search(inp.value.trim()); } if (e.key === 'Escape') close(); });
  document.addEventListener('click', e => { if (!box.contains(e.target) && e.target !== inp) close(); });
  async function search(q) {
    if (!q) return;
    let items = [];
    try {
      if (/^\d{5}$/.test(q)) {
        const d = await getJSON('https://api.zippopotam.us/us/' + q, {}, 8000);
        items = d.places.map(p => ({ lat: +p.latitude, lon: +p.longitude, name: `${p['place name']}, ${p['state abbreviation']}`, sub: 'ZIP ' + q }));
      } else {
        const d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=' + encodeURIComponent(q), {}, 8000);
        items = (d.results || []).map(r => ({ lat: r.latitude, lon: r.longitude, name: r.country_code === 'US' && r.admin1 ? `${r.name}, ${stAbbr(r.admin1)}` : `${r.name}, ${r.country || ''}`, sub: [r.admin2, r.admin1, r.country].filter(Boolean).join(', ') }));
      }
    } catch { items = []; }
    box.innerHTML = items.length ? items.map((it, i) => `<button data-i="${i}" class="text-left px-3 py-2.5 rounded-xl hover:bg-zinc-700 flex items-center gap-3 w-full"><i class="ph ph-map-pin text-blue-400"></i><span><span class="block text-sm font-medium text-zinc-100">${esc(it.name)}</span><span class="block text-xs text-zinc-400">${esc(it.sub)}</span></span></button>`).join('') : '<div class="px-3 py-2 text-sm text-zinc-400">No places found</div>';
    box.classList.remove('hidden'); box.classList.add('flex');
    box.querySelectorAll('button').forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; inp.value = ''; close(); inp.blur(); setLocation({ lat: +(+it.lat).toFixed(4), lon: +(+it.lon).toFixed(4), name: it.name }); });
  }
}

/* ---------- saved ---------- */
function renderSaved() {
  const wrap = $('#savedChips');
  const same = l => S.loc && Math.abs(l.lat - S.loc.lat) < .01 && Math.abs(l.lon - S.loc.lon) < .01;
  wrap.innerHTML = S.saved.length ? S.saved.map((l, i) => `<span class="chip ${same(l) ? 'on' : ''}"><button data-go="${i}" style="color:inherit;padding:0">${esc(l.name)}</button><button data-rm="${i}" aria-label="Remove ${esc(l.name)}"><i class="ph ph-x"></i></button></span>`).join('') : '<span class="text-xs text-zinc-600 whitespace-nowrap">none yet</span>';
  wrap.querySelectorAll('[data-go]').forEach(b => b.onclick = () => setLocation(S.saved[+b.dataset.go]));
  wrap.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.saved.splice(+b.dataset.rm, 1); lsSet('saved', S.saved); renderSaved(); });
}

/* ---------- data ---------- */
const CUR = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,uv_index,cape';
const HR = 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,uv_index,cape,freezing_level_height,is_day,soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,vapour_pressure_deficit,shortwave_radiation,snow_depth,snowfall';
const DY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration';
const fcURL = model => `https://api.open-meteo.com/v1/forecast?latitude=${S.loc.lat}&longitude=${S.loc.lon}&current=${CUR}&hourly=${HR}&daily=${DY}&timezone=auto&past_days=1&forecast_days=16${unitQS()}${model && model !== 'best_match' ? '&models=' + model : ''}`;
function mergeModel(best, m) {
  if (!m) return best;
  for (const sec of ['current', 'hourly', 'daily']) {
    if (!m[sec] || !best[sec]) continue;
    for (const k of Object.keys(best[sec])) {
      const a = m[sec][k], b = best[sec][k];
      if (Array.isArray(b)) m[sec][k] = Array.isArray(a) ? b.map((bv, i) => a[i] ?? bv) : b;
      else if (a == null) m[sec][k] = b;
    }
  }
  return m;
}
let loading = false;
function safe(fn) { try { fn(); } catch (e) { console.warn('Render issue in ' + fn.name, e); } }
/* ---------- offline snapshot (PWA) ---------- */
function saveSnap() {
  try {
    const D = S.D, n = 72, h0 = Math.max(0, idxNow() - 2);
    const H = {}; for (const k in D.hourly) H[k] = D.hourly[k].slice(h0, h0 + n);
    localStorage.setItem('nx_snap', JSON.stringify({ t: Date.now(), unit: S.unit, loc: S.loc, D: { ...D, hourly: H } }));
  } catch (e) { /* storage full: skip snapshot */ }
}
function useSnap() {
  const snap = ls('snap', null);
  if (!snap || !snap.D || snap.unit !== S.unit) return false;
  S.D = snap.D; S.updated = new Date(snap.t); S.offline = true;
  $('#loadingOverlay').classList.add('hidden'); $('#weatherContent').classList.remove('hidden'); $('#weatherContent').classList.add('flex');
  safe(renderCore);
  document.dispatchEvent(new CustomEvent('nx:data', { detail: { offline: true, t: snap.t } }));
  return true;
}
async function loadAll(showSpinner) {
  if (!S.loc || loading) return; loading = true;
  if (showSpinner && !S.D) { $('#loadingOverlay').classList.remove('hidden'); $('#loadingText').textContent = 'Syncing satellite data...'; }
  const { lat, lon } = S.loc;
  try {
    const [best, mod] = await Promise.all([getJSON(fcURL()), S.model !== 'best_match' ? getJSON(fcURL(S.model)).catch(() => null) : null]);
    S.D = mergeModel(best, mod);
    S.updated = new Date();
    $('#loadingOverlay').classList.add('hidden'); $('#weatherContent').classList.remove('hidden'); $('#weatherContent').classList.add('flex');
    safe(renderCore);
    S.offline = false; saveSnap();
    document.dispatchEvent(new CustomEvent('nx:data', { detail: { offline: false } }));
  } catch (e) {
    loading = false;
    if (useSnap()) return;
    console.warn('Forecast failed', e);
    $('#loadingOverlay').classList.remove('hidden');
    $('#loadingText').textContent = 'Could not load the forecast. Check your connection and try again.';
    return;
  }
  loading = false;
  const today = S.D.current.time.slice(0, 10);
  const ly = new Date(today + 'T12:00:00Z'); ly.setUTCFullYear(ly.getUTCFullYear() - 1); const lyd = ly.toISOString().slice(0, 10);
  const jobs = [
    getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`).then(d => { S.AQ = d; }).catch(() => { S.AQ = null; }).finally(() => { safe(renderAir); safe(renderAqiGauge); safe(renderDeepAir); }),
    getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature&timezone=auto${F() ? '&length_unit=imperial&temperature_unit=fahrenheit' : ''}`).then(d => { S.MR = d; }).catch(() => { S.MR = null; }).finally(() => safe(renderMarine)),
    getJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${lyd}&end_date=${lyd}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto${unitQS()}`).then(d => { S.LY = d; }).catch(() => { S.LY = null; }).finally(() => safe(renderLastYear)),
    getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&models=ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless&timezone=auto&forecast_days=10${unitQS()}`).then(d => { S.MC = d; safe(renderModels); }).catch(() => {}),
    getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(d => { S.KP = d; }).catch(() => { S.KP = null; }).finally(() => safe(renderSpace)),
    loadNWS()
  ];
  await Promise.allSettled(jobs);
  safe(renderStorm); safe(renderRecos);
}
async function loadNWS() {
  S.NWS = null; S.ALERTS = [];
  const { lat, lon } = S.loc;
  const H = { headers: { Accept: 'application/geo+json' } };
  const alertsP = getJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, H, 10000).then(d => { S.ALERTS = (d.features || []).map(f => f.properties); }).catch(() => { S.ALERTS = []; });
  try {
    const p = await getJSON(`https://api.weather.gov/points/${lat},${lon}`, H, 10000);
    const pr = p.properties; S.NWS = { office: pr.cwa, rel: pr.relativeLocation && pr.relativeLocation.properties };
    const [fc, st] = await Promise.all([getJSON(pr.forecast, H, 12000).catch(() => null), getJSON(pr.observationStations, H, 10000).catch(() => null)]);
    S.NWS.forecast = fc && fc.properties.periods;
    const sid = st && st.features && st.features[0] && st.features[0].properties.stationIdentifier;
    if (sid) {
      S.NWS.station = st.features[0].properties.name; S.NWS.sid = sid;
      const ob = await getJSON(`https://api.weather.gov/stations/${sid}/observations/latest`, H, 10000).catch(() => null);
      S.NWS.obs = ob && ob.properties;
    }
  } catch { S.NWS = { none: true }; }
  await alertsP;
  safe(renderNWS); safe(renderAlerts);
}
function idxNow() { const H = S.D.hourly, key = S.D.current.time.slice(0, 13); const i = H.time.findIndex(t => t.slice(0, 13) === key); return i < 0 ? 0 : i; }
function todayIdx() { const d = S.D.daily; const i = d.time.indexOf(S.D.current.time.slice(0, 10)); return i < 0 ? 0 : i; }

/* ---------- core render ---------- */
let hourlyChart, yestChart, modelChart;
function renderCore() {
  const D = S.D, c = D.current, d = D.daily, H = D.hourly, h0 = idxNow(), ti = todayIdx();
  const w = wx(c.weather_code, c.is_day);
  $('#locationName').textContent = S.loc.name;
  document.title = `${Math.round(c.temperature_2m)}° ${S.loc.name} | NEXUS Ultimate`;
  $('#currentDate').textContent = new Date(c.time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + fmtTime(c.time);
  $('#currentTemp').textContent = deg(c.temperature_2m);
  $('#currentCondition').textContent = w.text;
  $('#feelsLike').textContent = deg(c.apparent_temperature);
  $('#highTemp').textContent = deg(d.temperature_2m_max[ti]);
  $('#lowTemp').textContent = deg(d.temperature_2m_min[ti]);
  $('#heroIcon').className = `ph-fill ${w.icon} text-6xl ${iconColor(c.weather_code)} mb-2 drop-shadow-lg`;
  $('#heroIconBg').className = `ph-fill ${w.icon} text-[320px]`;
  const mname = $('#modelSelect').selectedOptions[0].textContent;
  $('#updatedAt').innerHTML = `<i class="ph ph-arrows-clockwise"></i> Updated ${S.updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${esc(mname)} model · auto-refresh 10 min`;
  let hh = '';
  for (let i = h0; i < h0 + 24 && i < H.time.length; i++) {
    const hw = wx(H.weather_code[i], H.is_day[i]);
    hh += `<div class="hr-item ${i === h0 ? 'now' : ''}"><span class="text-[11px] font-semibold text-zinc-400">${i === h0 ? 'Now' : fmtHour(H.time[i])}</span><i class="ph-fill ${hw.icon} text-2xl ${iconColor(H.weather_code[i])}"></i><span class="font-bold text-zinc-100">${deg(H.temperature_2m[i])}</span><span class="text-[10px] font-semibold ${H.precipitation_probability[i] > 30 ? 'text-blue-400' : 'text-zinc-500'}"><i class="ph-fill ph-drop"></i>${r0(H.precipitation_probability[i])}%</span></div>`;
  }
  $('#hourly').innerHTML = hh;
  safe(renderDaily); safe(renderGauges); safe(renderCharts); safe(renderAviation); safe(renderSoil); safe(renderRecos); safe(renderStorm);
  initRadar();
}
function renderDaily() {
  const d = S.D.daily, ti = todayIdx(), n = S.days, end = Math.min(d.time.length, ti + n);
  const lo = Math.min(...d.temperature_2m_min.slice(ti, end).filter(v => v != null)), hi = Math.max(...d.temperature_2m_max.slice(ti, end).filter(v => v != null));
  let h = '';
  for (let i = ti; i < end; i++) {
    if (d.temperature_2m_max[i] == null) continue;
    const w = wx(d.weather_code[i]);
    const dn = i === ti ? 'Today' : new Date(d.time[i] + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' });
    const l = (d.temperature_2m_min[i] - lo) / (hi - lo || 1) * 100, r = (d.temperature_2m_max[i] - lo) / (hi - lo || 1) * 100;
    const pp = d.precipitation_probability_max[i];
    h += `<div class="day-row" title="${esc(w.text)} · wind ${r0(d.wind_speed_10m_max[i])} ${wU()}"><span class="font-semibold text-zinc-200 leading-tight">${dn}<span class="block text-[10px] text-zinc-500 font-medium">${d.time[i].slice(5).replace('-', '/')}</span></span><span class="flex flex-col items-center"><i class="ph-fill ${w.icon} text-xl ${iconColor(d.weather_code[i])}"></i>${pp >= 20 ? `<span class="text-[9px] font-bold text-blue-400">${pp}%</span>` : ''}</span><span class="text-zinc-400 text-right">${deg(d.temperature_2m_min[i])}</span><div class="range"><div style="left:${l}%;right:${100 - r}%"></div></div><span class="font-semibold text-zinc-100">${deg(d.temperature_2m_max[i])}</span></div>`;
  }
  $('#daily').innerHTML = h;
  $('#dailyTitle').textContent = n + '-Day Outlook';
}
function renderGauges() {
  const c = S.D.current, H = S.D.hourly, d = S.D.daily, h0 = idxNow(), ti = todayIdx();
  compassGauge('g-wind', c.wind_direction_10m, c.wind_speed_10m, c.wind_gusts_10m);
  setFoot('wind', `Gusts <b class="text-zinc-300">${r0(c.wind_gusts_10m)} ${wU()}</b>`);
  arcGauge('g-humidity', { value: c.relative_humidity_2m, min: 0, max: 100, unit: '%', stops: ['#fbbf24', '#22d3ee', '#3b82f6'], aria: 'Humidity' });
  setFoot('humidity', `Dew point <b class="text-zinc-300">${deg(c.dew_point_2m)}</b>`);
  const p = c.pressure_msl, p3 = H.pressure_msl[Math.max(0, h0 - 3)], tr = p != null && p3 != null ? p - p3 : 0;
  const trTxt = tr > 0.8 ? '<i class="ph ph-trend-up"></i> Rising' : tr < -0.8 ? '<i class="ph ph-trend-down"></i> Falling' : 'Steady';
  arcGauge('g-pressure', { value: p, min: 970, max: 1050, display: F() ? (p * 0.02953).toFixed(2) : Math.round(p), unit: F() ? 'inHg' : 'hPa', stops: ['#ef4444', '#a855f7', '#3b82f6'], aria: 'Pressure' });
  setFoot('pressure', `${trTxt} · ${p < 1000 ? 'stormy' : p > 1022 ? 'fair' : 'normal'}`);
  const uv = c.uv_index ?? H.uv_index[h0], uc = uvCat(uv);
  arcGauge('g-uv', { value: uv, min: 0, max: 12, display: uv == null ? '--' : (+uv).toFixed(1).replace(/\.0$/, ''), stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444', '#a855f7'], label: uc[0], labelColor: uc[1], aria: 'UV index' });
  setFoot('uv', `Today's max ${d.uv_index_max[ti] == null ? '--' : (+d.uv_index_max[ti]).toFixed(1)}`);
  sunGauge('g-sun', d.sunrise[ti], d.sunset[ti], c.time);
  const dl = d.daylight_duration[ti]; setFoot('sun', `Daylight ${dl ? Math.floor(dl / 3600) + 'h ' + Math.round(dl % 3600 / 60) + 'm' : '--'}`);
  const pp = H.precipitation_probability[h0];
  arcGauge('g-rain', { value: pp, min: 0, max: 100, unit: '%', stops: ['#64748b', '#38bdf8', '#2563eb'], aria: 'Rain chance' });
  setFoot('rain', `Today ${(d.precipitation_sum[ti] ?? 0).toFixed(F() ? 2 : 1)} ${pU()} · max ${r0(d.precipitation_probability_max[ti])}%`);
  const fl = c.apparent_temperature, flF = F() ? fl : toF(fl);
  arcGauge('g-feels', { value: flF, min: -10, max: 110, display: Math.round(fl), unit: tU(), stops: ['#818cf8', '#38bdf8', '#4ade80', '#facc15', '#ef4444'], label: flF < 32 ? 'Freezing' : flF < 50 ? 'Cold' : flF < 65 ? 'Cool' : flF < 80 ? 'Pleasant' : flF < 90 ? 'Warm' : 'Hot', labelColor: flF < 50 ? '#38bdf8' : flF < 80 ? '#4ade80' : '#fb923c', aria: 'Feels like' });
  setFoot('feels', `Actual ${deg(c.temperature_2m)}`);
  const dw = c.dew_point_2m, dwF = F() ? dw : toF(dw), dc = dewCat(dwF);
  arcGauge('g-dew', { value: dwF, min: 20, max: 80, display: Math.round(dw), unit: tU(), stops: ['#38bdf8', '#4ade80', '#facc15', '#ef4444'], label: dc[0], labelColor: dc[1], aria: 'Dew point' });
  setFoot('dew', 'How sticky it feels');
  const vRaw = c.visibility ?? H.visibility[h0], vis = vRaw == null ? null : F() ? vRaw / 5280 : vRaw / 1000, vmax = F() ? 10 : 16;
  arcGauge('g-vis', { value: vis, min: 0, max: vmax, display: vis == null ? '--' : vis >= vmax ? vmax + '+' : vis.toFixed(1), unit: F() ? 'mi' : 'km', stops: ['#ef4444', '#facc15', '#a5b4fc'], aria: 'Visibility' });
  setFoot('vis', vis == null ? '' : vis < vmax / 10 ? 'Fog / poor' : vis < vmax / 2 ? 'Hazy' : 'Clear view');
  arcGauge('g-cloud', { value: c.cloud_cover, min: 0, max: 100, unit: '%', stops: ['#38bdf8', '#94a3b8', '#52525b'], aria: 'Cloud cover' });
  setFoot('cloud', `Low ${r0(H.cloud_cover_low[h0])} · Mid ${r0(H.cloud_cover_mid[h0])} · High ${r0(H.cloud_cover_high[h0])}`);
  moonGauge('g-moon');
  renderAqiGauge();
  safe(renderDeep);
}
function renderAqiGauge() {
  const v = S.AQ && S.AQ.current ? S.AQ.current.us_aqi : null, ac = aqiCat(v);
  arcGauge('g-aqi', { value: v, min: 0, max: 300, stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444', '#a855f7'], label: ac[0], labelColor: ac[1], aria: 'US AQI' });
  setFoot('aqi', v == null ? (S.AQ === null ? 'Unavailable' : 'Loading...') : `US AQI · PM2.5 ${r0(S.AQ.current.pm2_5)}`);
}

/* ---------- deep data: extra gauges + 24h trend sparklines ---------- */
const DEEP = [
  ['temp', 'ph-thermometer-simple', 'text-orange-400', 'Temperature'], ['gust', 'ph-wind', 'text-teal-300', 'Wind Gusts'],
  ['aloft', 'ph-airplane-tilt', 'text-sky-300', 'Wind Aloft'], ['solar', 'ph-sun', 'text-amber-400', 'Solar Power'],
  ['sunshine', 'ph-sun-dim', 'text-yellow-400', 'Sunshine Today'], ['storm', 'ph-lightning', 'text-fuchsia-400', 'Storm Energy'],
  ['pm25', 'ph-circles-three', 'text-lime-400', 'PM2.5'], ['pm10', 'ph-circles-four', 'text-emerald-400', 'PM10'],
  ['ozone', 'ph-atom', 'text-cyan-300', 'Ozone'], ['pollen', 'ph-flower', 'text-pink-400', 'Pollen'],
  ['soil', 'ph-plant', 'text-green-500', 'Soil Temp'], ['freeze', 'ph-snowflake', 'text-blue-300', 'Freezing Level'],
  ['snow', 'ph-cloud-snow', 'text-slate-200', 'Snow']
];
const TRENDS = [
  ['pressure_msl', 'Pressure', 'ph-arrows-in-line-vertical', '#a855f7', v => F() ? (v * 0.02953).toFixed(2) + ' inHg' : Math.round(v) + ' hPa'],
  ['relative_humidity_2m', 'Humidity', 'ph-drop-half', '#22d3ee', v => Math.round(v) + '%'],
  ['wind_speed_10m', 'Wind', 'ph-wind', '#2dd4bf', v => Math.round(v) + ' ' + wU()]
];
function buildDeepGrid() {
  const g = $('#deepGrid'); if (!g) return;
  g.innerHTML = DEEP.map(([k, ic, col, t]) => `<div class="card gcard" id="dc-${k}"><div class="ghead"><i class="ph-fill ${ic} ${col}"></i>${t}</div><div class="gbody" id="g-${k}"></div><div class="gfoot" id="gf-${k}"></div></div>`).join('');
  $('#trendGrid').innerHTML = TRENDS.map(([k, t, ic, col]) => `<div class="card trend-card"><div class="ghead"><i class="ph-fill ${ic}" style="color:${col}"></i>${t}<span class="ml-auto text-xs text-zinc-500" id="tr-${k}-d"></span></div><div class="trend-now" id="tr-${k}-v">--</div><div id="tr-${k}"></div><div class="trend-axis"><span>-12h</span><span>now</span><span>+12h</span></div></div>`).join('');
}
function sparkline(el, vals, nowI, color) {
  if (typeof el === 'string') el = document.getElementById(el);
  const pts = vals.map((v, i) => [i, num(v)]).filter(p => p[1] != null);
  if (!el || pts.length < 3) { if (el) el.innerHTML = '<div class="text-xs text-zinc-500 py-4 text-center">No trend data</div>'; return; }
  const W = 300, Hh = 64, n = vals.length - 1, lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), span = (hi - lo) || 1;
  const X = i => i / n * W, Y = v => Hh - 6 - (v - lo) / span * (Hh - 14);
  const line = pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const id = 'sp' + (++gid), nx = X(nowI), nowV = num(vals[nowI]);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="spark" role="img" aria-label="24 hour trend"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L ${X(pts[pts.length - 1][0]).toFixed(1)} ${Hh} L ${X(pts[0][0]).toFixed(1)} ${Hh} Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" class="spark-line"/>
    <line x1="${nx}" x2="${nx}" y1="0" y2="${Hh}" stroke="#fafafa" stroke-opacity=".35" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
    ${nowV == null ? '' : `<circle cx="${nx}" cy="${Y(nowV)}" r="3.5" fill="#fafafa" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`}</svg>`;
}
function renderDeep() {
  if (!$('#deepGrid')) return;
  const c = S.D.current, H = S.D.hourly, d = S.D.daily, h0 = idxNow(), ti = todayIdx();
  const at = (k, i = h0) => H[k] ? num(H[k][i]) : null;
  // trends: 12h back, 12h ahead
  const a = Math.max(0, h0 - 12), b = Math.min(H.time.length - 1, h0 + 12);
  TRENDS.forEach(([k, , , col, fmt]) => {
    const vals = (H[k] || []).slice(a, b + 1);
    sparkline('tr-' + k, vals, h0 - a, col);
    const now = at(k), past = at(k, a), fut = at(k, b);
    $('#tr-' + k + '-v').textContent = now == null ? '--' : fmt(now);
    const dd = $('#tr-' + k + '-d');
    if (k === 'pressure_msl' && now != null && at(k, Math.max(0, h0 - 3)) != null) { const t3 = now - at(k, Math.max(0, h0 - 3)); dd.innerHTML = t3 > 0.8 ? '↗ rising' : t3 < -0.8 ? '↘ falling' : '→ steady'; }
    else if (fut != null && now != null) { const lo = Math.min(...vals.filter(v => v != null)), hi = Math.max(...vals.filter(v => v != null)); dd.textContent = `${fmt(lo)} – ${fmt(hi)}`; }
  });
  // temperature with today's range
  const t = c.temperature_2m, tF = F() ? t : toF(t), hi = d.temperature_2m_max[ti], lo = d.temperature_2m_min[ti];
  arcGauge('g-temp', { value: tF, min: -10, max: 110, display: Math.round(t), unit: tU(), stops: ['#818cf8', '#38bdf8', '#4ade80', '#facc15', '#ef4444'], aria: 'Temperature' });
  setFoot('temp', `H <b class="text-zinc-300">${deg(hi)}</b> · L <b class="text-zinc-300">${deg(lo)}</b>`);
  // gusts
  const kmh = v => v == null ? null : F() ? v * 1.609 : v, g = c.wind_gusts_10m;
  const gc = kmh(g) == null ? ['--', '#a1a1aa'] : kmh(g) < 30 ? ['Calm', '#4ade80'] : kmh(g) < 50 ? ['Breezy', '#facc15'] : kmh(g) < 75 ? ['Gusty', '#fb923c'] : ['Damaging', '#ef4444'];
  arcGauge('g-gust', { value: kmh(g), min: 0, max: 100, display: r0(g), unit: wU(), stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444'], label: gc[0], labelColor: gc[1], aria: 'Wind gusts' });
  setFoot('gust', `Peak today <b class="text-zinc-300">${r0(d.wind_gusts_10m_max[ti])} ${wU()}</b>`);
  // wind aloft (120 m)
  const al = at('wind_speed_120m');
  arcGauge('g-aloft', { value: kmh(al), min: 0, max: 100, display: r0(al), unit: wU(), stops: ['#a5b4fc', '#38bdf8', '#2563eb'], aria: 'Wind at 120 meters' });
  setFoot('aloft', `At 120 m · 180 m: ${r0(at('wind_speed_180m'))}`);
  // solar radiation
  const sr = at('shortwave_radiation');
  arcGauge('g-solar', { value: sr, min: 0, max: 1000, unit: 'W/m²', stops: ['#52525b', '#facc15', '#f97316'], label: sr == null ? '' : sr < 50 ? (c.is_day ? 'Dim' : 'Night') : sr < 300 ? 'Weak' : sr < 650 ? 'Strong' : 'Intense', labelColor: '#fbbf24', aria: 'Solar radiation' });
  setFoot('solar', 'Sunlight hitting the ground');
  // sunshine today
  const ss = d.sunshine_duration[ti], dl = d.daylight_duration[ti], sp = ss != null && dl ? ss / dl * 100 : null;
  arcGauge('g-sunshine', { value: sp, min: 0, max: 100, unit: '%', stops: ['#64748b', '#fde047', '#facc15'], aria: 'Sunshine today' });
  setFoot('sunshine', ss == null ? '' : `${Math.floor(ss / 3600)}h ${Math.round(ss % 3600 / 60)}m of sun expected`);
  // storm energy (CAPE)
  const cp = c.cape ?? at('cape'), cc = cp == null ? ['--', '#a1a1aa'] : cp < 300 ? ['Stable', '#4ade80'] : cp < 1000 ? ['Marginal', '#facc15'] : cp < 2500 ? ['Unstable', '#fb923c'] : ['Explosive', '#ef4444'];
  arcGauge('g-storm', { value: cp, min: 0, max: 3500, unit: 'J/kg', stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444', '#a855f7'], label: cc[0], labelColor: cc[1], aria: 'Storm energy CAPE' });
  setFoot('storm', `Max next 24h ${r0(Math.max(0, ...((H.cape || []).slice(h0, h0 + 24).filter(v => v != null))))}`);
  // soil
  const st = at('soil_temperature_6cm') ?? at('soil_temperature_0cm'), stF = st == null ? null : F() ? st : toF(st);
  arcGauge('g-soil', { value: stF, min: 20, max: 100, display: r0(st), unit: tU(), stops: ['#38bdf8', '#4ade80', '#a3e635', '#f97316'], label: stF == null ? '' : stF < 32 ? 'Frozen' : stF < 50 ? 'Cold' : stF < 65 ? 'Planting OK' : 'Warm', labelColor: '#86efac', aria: 'Soil temperature' });
  setFoot('soil', `6 cm deep · surface ${deg(at('soil_temperature_0cm'))}`);
  // freezing level
  const fzD = at('freezing_level_height'), fz = fzD == null ? null : F() ? fzD / 3.281 : fzD; // API sends ft in imperial mode
  arcGauge('g-freeze', { value: fz, min: 0, max: 5000, display: fzD == null ? '--' : fzD >= 10000 ? (fzD / 1000).toFixed(1) + 'k' : Math.round(fzD).toLocaleString(), unit: F() ? 'ft' : 'm', stops: ['#e0f2fe', '#38bdf8', '#1d4ed8'], aria: 'Freezing level' });
  setFoot('freeze', fz == null ? '' : fz < 300 ? 'Snow can reach the ground' : 'Height where it hits 32°');
  // snow
  const sd = at('snow_depth'), sf24 = (H.snowfall || []).slice(h0, h0 + 24).reduce((s, v) => s + (v || 0), 0);
  const sdD = sd == null ? null : F() ? sd * 12 : sd * 100, sfD = sf24; // API: ft + inch (imperial) or m + cm
  arcGauge('g-snow', { value: sdD, min: 0, max: F() ? 24 : 60, display: sdD == null ? '--' : sdD < 0.05 ? '0' : sdD.toFixed(1), unit: F() ? 'in' : 'cm', stops: ['#cbd5e1', '#e2e8f0', '#ffffff'], label: sdD != null && sdD >= 0.05 ? 'On ground' : 'No snow', labelColor: '#cbd5e1', aria: 'Snow depth' });
  setFoot('snow', `Next 24h <b class="text-zinc-300">${sfD.toFixed(1)} ${F() ? 'in' : 'cm'}</b> snowfall`);
  renderDeepAir();
}
function renderDeepAir() {
  if (!$('#deepGrid')) return;
  const A = S.AQ && S.AQ.current, wait = S.AQ === null ? 'Unavailable' : 'Loading...';
  const v = k => A ? num(A[k]) : null;
  const pm25 = v('pm2_5'), pm10 = v('pm10'), oz = v('ozone');
  const c25 = pm25 == null ? ['--', '#a1a1aa'] : pm25 <= 9 ? ['Good', '#4ade80'] : pm25 <= 35.4 ? ['Moderate', '#facc15'] : pm25 <= 55.4 ? ['Sensitive', '#fb923c'] : ['Unhealthy', '#ef4444'];
  arcGauge('g-pm25', { value: pm25, min: 0, max: 75, display: pm25 == null ? '--' : pm25.toFixed(1), unit: 'µg/m³', stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444'], label: c25[0], labelColor: c25[1], aria: 'PM2.5' });
  setFoot('pm25', A ? 'Fine particles (smoke, exhaust)' : wait);
  const c10 = pm10 == null ? ['--', '#a1a1aa'] : pm10 <= 54 ? ['Good', '#4ade80'] : pm10 <= 154 ? ['Moderate', '#facc15'] : ['Unhealthy', '#ef4444'];
  arcGauge('g-pm10', { value: pm10, min: 0, max: 200, unit: 'µg/m³', stops: ['#4ade80', '#facc15', '#ef4444'], label: c10[0], labelColor: c10[1], aria: 'PM10' });
  setFoot('pm10', A ? 'Dust and pollen-size particles' : wait);
  const co = oz == null ? ['--', '#a1a1aa'] : oz <= 100 ? ['Good', '#4ade80'] : oz <= 160 ? ['Moderate', '#facc15'] : ['High', '#ef4444'];
  arcGauge('g-ozone', { value: oz, min: 0, max: 240, unit: 'µg/m³', stops: ['#4ade80', '#facc15', '#ef4444'], label: co[0], labelColor: co[1], aria: 'Ozone' });
  setFoot('ozone', A ? 'Ground-level ozone' : wait);
  const PK = [['grass_pollen', 'Grass'], ['ragweed_pollen', 'Ragweed'], ['birch_pollen', 'Birch'], ['alder_pollen', 'Alder'], ['mugwort_pollen', 'Mugwort'], ['olive_pollen', 'Olive']];
  const pv = PK.map(([k, n]) => [n, v(k)]).filter(p => p[1] != null);
  const card = $('#dc-pollen');
  if (!pv.length) { if (card) card.classList.toggle('hidden', !!A); arcGauge('g-pollen', { value: null, min: 0, max: 100 }); setFoot('pollen', A ? 'Not tracked here' : wait); return; }
  if (card) card.classList.remove('hidden');
  const top = pv.reduce((x, y) => y[1] > x[1] ? y : x), pc = top[1] < 10 ? ['Low', '#4ade80'] : top[1] < 50 ? ['Moderate', '#facc15'] : top[1] < 200 ? ['High', '#fb923c'] : ['Very high', '#ef4444'];
  arcGauge('g-pollen', { value: top[1], min: 0, max: 200, display: Math.round(top[1]), unit: 'grains', stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444'], label: pc[0], labelColor: pc[1], aria: 'Pollen' });
  setFoot('pollen', `Top: ${top[0]}`);
}

/* ---------- charts ---------- */
function chartBase() {
  const light = S.theme === 'light', grid = light ? '#e4e4e7' : '#27272a', tick = light ? '#52525b' : '#a1a1aa';
  return { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { family: 'Inter', size: 11 } } }, tooltip: { backgroundColor: '#18181b', borderColor: '#3f3f46', borderWidth: 1 } },
    scales: { x: { grid: { color: grid }, ticks: { color: tick, maxRotation: 0, autoSkipPadding: 14, font: { family: 'Inter', size: 10 } } }, y: { grid: { color: grid }, ticks: { color: tick, font: { family: 'Inter', size: 10 } } } } };
}
function renderCharts() {
  if (!window.Chart) return;
  const H = S.D.hourly, h0 = idxNow(), end = Math.min(H.time.length, h0 + 48);
  const lab = H.time.slice(h0, end).map(fmtHour);
  hourlyChart && hourlyChart.destroy();
  const o = chartBase(); o.scales.y1 = { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: o.scales.y.ticks.color, callback: v => v + '%', font: { size: 10 } } };
  hourlyChart = new Chart($('#hourlyChart'), { data: { labels: lab, datasets: [
    { type: 'line', label: 'Temp ' + tU(), data: H.temperature_2m.slice(h0, end), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,.12)', fill: true, tension: .35, pointRadius: 0, borderWidth: 2 },
    { type: 'line', label: 'Feels like', data: H.apparent_temperature.slice(h0, end), borderColor: '#f472b6', borderDash: [4, 4], tension: .35, pointRadius: 0, borderWidth: 1.5 },
    { type: 'bar', label: 'Rain %', data: H.precipitation_probability.slice(h0, end), backgroundColor: 'rgba(56,189,248,.35)', yAxisID: 'y1', borderRadius: 3 }
  ] }, options: o });
  const today = S.D.current.time.slice(0, 10), yd = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  const T = [], Y = [];
  H.time.forEach((t, i) => { if (t.startsWith(today)) T.push(H.temperature_2m[i]); else if (t.startsWith(yd)) Y.push(H.temperature_2m[i]); });
  yestChart && yestChart.destroy();
  yestChart = new Chart($('#yestChart'), { type: 'line', data: { labels: Array.from({ length: 24 }, (_, i) => fmtHour('0000-00-00T' + String(i).padStart(2, '0'))), datasets: [
    { label: 'Today', data: T, borderColor: '#fb923c', backgroundColor: 'rgba(251,146,60,.12)', fill: true, tension: .35, pointRadius: 0, borderWidth: 2.2 },
    { label: 'Yesterday', data: Y, borderColor: '#a1a1aa', borderDash: [5, 4], tension: .35, pointRadius: 0, borderWidth: 1.8 }
  ] }, options: chartBase() });
}
function renderModels() {
  if (!window.Chart || !S.MC) return;
  const d = S.MC.daily, lab = d.time.map(t => new Date(t + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' }));
  const M = [['ecmwf_ifs025', 'ECMWF', '#4FD3C4'], ['gfs_seamless', 'GFS', '#FFB454'], ['icon_seamless', 'ICON', '#FF8AD4'], ['jma_seamless', 'JMA', '#a78bfa']];
  modelChart && modelChart.destroy();
  modelChart = new Chart($('#modelChart'), { type: 'line', data: { labels: lab, datasets: M.map(([k, n, col]) => ({ label: n, data: d['temperature_2m_max_' + k] || [], borderColor: col, backgroundColor: col, tension: .3, pointRadius: 2.5, borderWidth: S.model === k ? 3.5 : 2, spanGaps: true })) }, options: chartBase() });
}

/* ---------- radar (RainViewer on Leaflet, no key) ---------- */
let map, marker, radarFrames = [], radarLayers = {}, radarIdx = 0, radarTimer = null, radarHost = '', baseLayer;
async function initRadar() {
  if (!window.L) return;
  const ll = [S.loc.lat, S.loc.lon];
  if (!map) {
    map = L.map('weatherMap', { zoomControl: true, scrollWheelZoom: false, tap: true }).setView(ll, 7);
    map.zoomControl.setPosition('topright');
    map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
    setBase();
    $('#radarPlay').onclick = () => radarTimer ? stopRadar() : playRadar();
    $('#radarSlider').oninput = e => { stopRadar(); showFrame(+e.target.value); };
    marker = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map);
    try {
      const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json', {}, 10000);
      radarHost = d.host; radarFrames = [...(d.radar.past || []), ...(d.radar.nowcast || [])];
      $('#radarSlider').max = radarFrames.length - 1;
      showFrame((d.radar.past || []).length - 1);
      playRadar();
      map.attributionControl.addAttribution('Radar <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a>');
    } catch (e) { console.warn('Radar unavailable', e); $('#radarTime').textContent = 'offline'; }
  } else { map.setView(ll, map.getZoom()); marker.setLatLng(ll); }
  marker.bindTooltip(esc(S.loc.name));
  setTimeout(() => map.invalidateSize(), 250);
}
function setBase() {
  if (!map) return;
  baseLayer && baseLayer.remove();
  // Esri Canvas basemap: keyless. (CARTO tiles now return an "API KEY REQUIRED" image, which is what broke the old NEXUS map.)
  const style = S.theme === 'light' ? 'Light' : 'Dark';
  const esri = n => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${style}_Gray_${n}/MapServer/tile/{z}/{y}/{x}`;
  baseLayer = L.layerGroup([
    L.tileLayer(esri('Base'), { maxZoom: 12, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri' }),
    L.tileLayer(esri('Reference'), { maxZoom: 12, maxNativeZoom: 16, zIndex: 20, pane: 'labels' })
  ]).addTo(map);
}
function radarLayer(i) {
  const f = radarFrames[i];
  if (!radarLayers[f.path]) radarLayers[f.path] = L.tileLayer(`${radarHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 10 }).addTo(map);
  return radarLayers[f.path];
}
function showFrame(i) {
  if (!radarFrames.length) return;
  i = (i + radarFrames.length) % radarFrames.length;
  const prev = radarFrames[radarIdx] && radarLayers[radarFrames[radarIdx].path];
  const lay = radarLayer(i); lay.setOpacity(0.75);
  if (prev && prev !== lay) prev.setOpacity(0);
  radarLayer((i + 1) % radarFrames.length);
  radarIdx = i; $('#radarSlider').value = i;
  const t = new Date(radarFrames[i].time * 1000);
  $('#radarTime').textContent = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + (radarFrames[i].time * 1000 > Date.now() ? '+' : '');
}
function playRadar() { stopRadar(); radarTimer = setInterval(() => showFrame(radarIdx + 1), 700); $('#radarPlay').innerHTML = '<i class="ph-fill ph-pause"></i>'; }
function stopRadar() { clearInterval(radarTimer); radarTimer = null; $('#radarPlay').innerHTML = '<i class="ph-fill ph-play"></i>'; }

/* ---------- air + pollen ---------- */
function renderAir() {
  const a = S.AQ && S.AQ.current;
  if (!a) { $('#pollutants').innerHTML = '<p class="col-span-3 text-sm text-zinc-500">Air quality data unavailable right now.</p>'; return; }
  const P = [['PM2.5', a.pm2_5, 75], ['PM10', a.pm10, 150], ['Ozone', a.ozone, 180], ['NO₂', a.nitrogen_dioxide, 100], ['SO₂', a.sulphur_dioxide, 100], ['CO', a.carbon_monoxide, 1500]];
  $('#pollutants').innerHTML = P.map(([k, v, mx]) => { const f = v == null ? 0 : clamp(v / mx * 100, 2, 100); const col = f < 35 ? '#4ade80' : f < 65 ? '#facc15' : '#ef4444'; return `<div class="stat"><div class="k">${k}</div><div class="v">${v == null ? '--' : Math.round(v)} <span class="text-[10px] text-zinc-500 font-medium">µg/m³</span></div><div class="bar"><div style="width:${f}%;background:${col}"></div></div></div>`; }).join('');
  const PL = [['Grass', a.grass_pollen, 50], ['Birch', a.birch_pollen, 100], ['Ragweed', a.ragweed_pollen, 50], ['Alder', a.alder_pollen, 100], ['Mugwort', a.mugwort_pollen, 50], ['Olive', a.olive_pollen, 100]].filter(p => p[1] != null);
  if (!PL.length) { $('#pollen').innerHTML = '<p class="col-span-3 text-sm text-zinc-500">Pollen counts come from the European pollen model, so they only show up for places in Europe. Nothing reported here.</p>'; return; }
  $('#pollen').innerHTML = PL.map(([k], i) => `<div><div id="g-pol${i}"></div><div class="text-center text-xs text-zinc-400">${k}</div></div>`).join('');
  PL.forEach(([k, v, mx], i) => { const f = v / mx; arcGauge('g-pol' + i, { value: v, min: 0, max: mx, small: true, stops: ['#4ade80', '#facc15', '#ef4444'], label: f < .2 ? 'Low' : f < .6 ? 'Med' : 'High', labelColor: f < .2 ? '#4ade80' : f < .6 ? '#facc15' : '#ef4444' }); });
}

/* ---------- marine ---------- */
function renderMarine() {
  const m = S.MR && S.MR.current, el = $('#marine');
  if (!m || m.wave_height == null) { el.innerHTML = `<div class="flex items-center gap-4"><i class="ph-fill ph-anchor text-5xl text-zinc-600"></i><p class="text-sm text-zinc-400">No ocean near ${esc(S.loc.name)}, so there's no wave data here. Search a beach town (try Huntington Beach) to see the surf gauges.</p></div>`; return; }
  const lu = F() ? 'ft' : 'm', wh = m.wave_height, per = m.wave_period || 0, whFt = F() ? wh : wh * 3.281;
  const score = clamp(Math.round((Math.min(whFt, 8) / 8) * 60 + (Math.min(per, 14) / 14) * 40), 0, 100);
  el.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div><div id="g-wave"></div><div class="text-center text-xs text-zinc-400">Wave height</div></div><div><div id="g-surf"></div><div class="text-center text-xs text-zinc-400">Surf score</div></div></div>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
    <div class="stat"><div class="k">Period</div><div class="v">${r0(m.wave_period)} s</div></div>
    <div class="stat"><div class="k">Swell</div><div class="v">${m.swell_wave_height == null ? '--' : (+m.swell_wave_height).toFixed(1)} ${lu}</div></div>
    <div class="stat"><div class="k">Direction</div><div class="v">${dirName(m.wave_direction)}</div></div>
    <div class="stat"><div class="k">Sea temp</div><div class="v">${deg(m.sea_surface_temperature)}</div></div></div>`;
  arcGauge('g-wave', { value: wh, min: 0, max: F() ? 12 : 4, display: (+wh).toFixed(1), unit: lu, stops: ['#22d3ee', '#3b82f6', '#6366f1'], small: true });
  arcGauge('g-surf', { value: score, min: 0, max: 100, stops: ['#64748b', '#22d3ee', '#22c55e'], label: score < 30 ? 'Flat' : score < 55 ? 'Fair' : score < 75 ? 'Good' : 'Epic', labelColor: score < 30 ? '#94a3b8' : '#22c55e', small: true });
}

/* ---------- this day last year ---------- */
function renderLastYear() {
  const el = $('#lastYear'), y = S.LY && S.LY.daily;
  if (!y || y.temperature_2m_max[0] == null) { el.textContent = 'Archive data not available for this spot.'; return; }
  const ti = todayIdx(), d = S.D.daily, diff = d.temperature_2m_max[ti] - y.temperature_2m_max[0], w = wx(y.weather_code[0]);
  el.innerHTML = `<div class="text-xs text-zinc-500 mb-3">${new Date(y.time[0] + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
  <div class="flex items-center gap-4 mb-4"><i class="ph-fill ${w.icon} text-5xl ${iconColor(y.weather_code[0])}"></i><div><div class="text-3xl font-bold text-zinc-100">${deg(y.temperature_2m_max[0])} <span class="text-lg text-zinc-500">/ ${deg(y.temperature_2m_min[0])}</span></div><div class="text-zinc-400">${w.text}</div></div></div>
  <div class="grid grid-cols-2 gap-2"><div class="stat"><div class="k">Rain</div><div class="v">${(y.precipitation_sum[0] ?? 0).toFixed(F() ? 2 : 1)} ${pU()}</div></div><div class="stat"><div class="k">Max wind</div><div class="v">${r0(y.wind_speed_10m_max[0])} ${wU()}</div></div></div>
  <p class="mt-3 text-sm ${diff >= 0 ? 'text-orange-300' : 'text-sky-300'}"><i class="ph-bold ${diff >= 0 ? 'ph-arrow-up' : 'ph-arrow-down'}"></i> Today's high is ${Math.abs(Math.round(diff))}° ${diff >= 0 ? 'warmer' : 'cooler'} than a year ago.</p>`;
}

/* ---------- storm center + extreme alerts ---------- */
function computeHazards() {
  const c = S.D.current, H = S.D.hourly, h0 = idxNow();
  const tF = F() ? c.temperature_2m : toF(c.temperature_2m), flF = F() ? c.apparent_temperature : toF(c.apparent_temperature);
  const nx = (arr, n) => arr.slice(h0, h0 + n).map(v => v || 0);
  const capeMax = Math.max(0, ...nx(H.cape, 12));
  const gustMax = Math.max(0, ...nx(H.wind_gusts_10m, 24)), gustMaxMph = F() ? gustMax : gustMax / 1.609;
  const precip24 = nx(H.precipitation, 24).reduce((a, b) => a + b, 0), precipIn = F() ? precip24 : precip24 / 25.4;
  const storms = H.weather_code.slice(h0, h0 + 24).some(v => v >= 95);
  const out = [];
  if (capeMax > 2500) out.push(['severe', 'Very high storm energy', `CAPE up to ${Math.round(capeMax)} J/kg in the next 12 hrs. Strong storms can form fast.`]);
  else if (capeMax > 1000) out.push(['watch', 'Storm energy building', `CAPE up to ${Math.round(capeMax)} J/kg. Thunderstorms possible.`]);
  if (storms) out.push(['watch', 'Thunderstorms in the forecast', 'Lightning possible in the next 24 hours. When thunder roars, go indoors.']);
  if (gustMaxMph > 55) out.push(['severe', 'Damaging wind gusts', `Gusts to ${Math.round(gustMax)} ${wU()} expected.`]);
  else if (gustMaxMph > 35) out.push(['watch', 'Gusty winds', `Gusts to ${Math.round(gustMax)} ${wU()} in the next 24 hrs.`]);
  if (precipIn > 2) out.push(['severe', 'Flooding rain', `${precip24.toFixed(1)} ${pU()} of rain in the next 24 hrs.`]);
  else if (precipIn > 1) out.push(['watch', 'Heavy rain', `${precip24.toFixed(1)} ${pU()} of rain in the next 24 hrs.`]);
  if (flF >= 105) out.push(['severe', 'Extreme heat', `Feels like ${deg(c.apparent_temperature)}. Limit time outside and drink water.`]);
  else if (flF >= 95) out.push(['watch', 'Heat stress', `Feels like ${deg(c.apparent_temperature)}.`]);
  if (flF <= -15) out.push(['severe', 'Dangerous wind chill', `Feels like ${deg(c.apparent_temperature)}. Frostbite in minutes.`]);
  else if (flF <= 10) out.push(['watch', 'Bitter cold', `Feels like ${deg(c.apparent_temperature)}.`]);
  if (tF <= 34 && (c.precipitation > 0 || [56, 57, 66, 67].includes(c.weather_code))) out.push(['watch', 'Icy roads possible', 'Near-freezing temps with precipitation.']);
  if (c.visibility != null && (F() ? c.visibility < 2640 : c.visibility < 800)) out.push(['watch', 'Dense fog', 'Visibility under half a mile.']);
  S.ALERTS.forEach(a => out.unshift([/extreme|severe/i.test(a.severity) ? 'severe' : 'watch', 'NWS: ' + a.event, a.headline || '']));
  const threat = clamp(capeMax / 30, 0, 45) + clamp((gustMaxMph - 15) * 0.9, 0, 30) + clamp(precipIn * 12, 0, 20) + (storms ? 15 : 0) + S.ALERTS.length * 15;
  return { list: out, threat: clamp(Math.round(threat), 0, 100) };
}
function labelBelow(id, txt) { const e = document.getElementById(id); if (e) e.insertAdjacentHTML('beforeend', `<div class="text-center text-xs text-zinc-400">${txt}</div>`); }
let lastSevere = '';
function renderStorm() {
  const z = computeHazards();
  arcGauge('g-threat', { value: z.threat, min: 0, max: 100, stops: ['#4ade80', '#facc15', '#fb923c', '#ef4444'], label: z.threat < 20 ? 'Calm' : z.threat < 45 ? 'Elevated' : z.threat < 70 ? 'High' : 'Severe', labelColor: z.threat < 20 ? '#4ade80' : z.threat < 45 ? '#facc15' : '#ef4444', small: true, aria: 'Storm threat' });
  arcGauge('g-cape', { value: S.D.current.cape ?? 0, min: 0, max: 4000, unit: 'J/kg', stops: ['#4ade80', '#facc15', '#ef4444', '#a855f7'], small: true, aria: 'CAPE' });
  labelBelow('g-threat', 'Storm threat'); labelBelow('g-cape', 'Storm energy (CAPE)');
  $('#hazards').innerHTML = z.list.length ? z.list.map(([lv, t, dsc]) => `<div class="flex gap-3 p-3 rounded-2xl border ${lv === 'severe' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/5'}"><i class="ph-fill ${lv === 'severe' ? 'ph-warning-octagon text-red-400' : 'ph-warning text-amber-400'} text-xl mt-0.5"></i><div><div class="font-semibold text-zinc-100 text-sm">${esc(t)}</div><div class="text-xs text-zinc-400">${esc(dsc)}</div></div></div>`).join('') : '<div class="flex gap-3 p-3 rounded-2xl border border-green-500/25 bg-green-500/5"><i class="ph-fill ph-shield-check text-green-400 text-xl"></i><div class="text-sm text-zinc-300">No hazards in the next 24 hours. All quiet.</div></div>';
  const sev = z.list.filter(h => h[0] === 'severe').map(h => h[1]).join('|');
  if (sev && sev !== lastSevere) toast('⚠️ ' + z.list.find(h => h[0] === 'severe')[1]);
  lastSevere = sev;
}
function renderAlerts() {
  const box = $('#alertsContainer');
  if (!S.ALERTS.length) { box.classList.add('hidden'); box.classList.remove('flex'); box.innerHTML = ''; return; }
  box.innerHTML = S.ALERTS.slice(0, 5).map(a => `<details class="card p-4 ${/extreme|severe/i.test(a.severity) ? 'pulse-border' : ''}" style="border-color:rgba(239,68,68,.45)"><summary class="cursor-pointer flex items-center gap-3 list-none"><i class="ph-fill ph-warning-octagon text-2xl text-red-400"></i><div class="flex-1"><div class="font-bold text-red-300">${esc(a.event)}</div><div class="text-xs text-zinc-400">${esc(a.headline || '')}</div></div><i class="ph ph-caret-down text-zinc-500"></i></summary><p class="mt-3 text-sm text-zinc-300 whitespace-pre-line">${esc((a.description || '').slice(0, 1600))}</p>${a.instruction ? `<p class="mt-2 text-sm text-amber-300 whitespace-pre-line">${esc(a.instruction.slice(0, 600))}</p>` : ''}</details>`).join('');
  box.classList.remove('hidden'); box.classList.add('flex');
}

/* ---------- space weather ---------- */
function renderSpace() {
  const rows = Array.isArray(S.KP) ? S.KP : [];
  let kp = null, when = '';
  const last = rows[rows.length - 1];
  if (last) { if (Array.isArray(last)) { kp = +last[1]; when = String(last[0]); } else { kp = +last.Kp; when = String(last.time_tag); } }
  if (isNaN(kp)) kp = null;
  arcGauge('g-kp', { value: kp, min: 0, max: 9, display: kp == null ? '--' : kp.toFixed(1), stops: ['#4ade80', '#facc15', '#ef4444', '#a855f7'], label: kp == null ? '' : kp < 4 ? 'Quiet' : kp < 5 ? 'Active' : kp < 7 ? 'Storm' : 'Severe storm', labelColor: kp < 4 ? '#4ade80' : kp < 5 ? '#facc15' : '#ef4444', small: true, aria: 'Kp index' });
  const lat = S.loc.lat, lon = S.loc.lon, magLat = Math.abs(lat) + (lon > -135 && lon < -50 ? 9 : lon > -20 && lon < 60 ? 2 : 0);
  const ch = kp == null ? null : clamp(Math.round((magLat - (66 - 2.2 * kp) + 3) / 7 * 100), 0, 99);
  arcGauge('g-aurora', { value: ch, min: 0, max: 100, unit: '%', stops: ['#334155', '#22c55e', '#a855f7'], small: true, aria: 'Aurora chance' });
  labelBelow('g-kp', 'Kp index (NOAA)'); labelBelow('g-aurora', 'Aurora chance here');
  const need = clamp(Math.ceil((66 - magLat + 1) / 2.2), 0, 9);
  $('#spaceInfo').innerHTML = kp == null ? 'Space weather feed unavailable right now.' : `Latest planetary Kp is ${kp.toFixed(1)} (${esc(when.slice(5, 16).replace('T', ' '))} UTC). Aurora usually needs about <b class="text-zinc-200">Kp ${need}</b> to show at your latitude. Rough estimate; best on dark, clear nights away from city lights.`;
}

/* ---------- aviation ---------- */
function renderAviation() {
  const c = S.D.current, H = S.D.hourly, h0 = idxNow();
  const tC = tempC(c.temperature_2m), dC = tempC(c.dew_point_2m);
  const baseFt = Math.max(0, Math.round((tC - dC) / 2.5 * 1000 / 100) * 100);
  const low = H.cloud_cover_low[h0] ?? 0, mid = H.cloud_cover_mid[h0] ?? 0;
  const ceiling = low >= 50 ? baseFt : mid >= 50 ? Math.max(baseFt, 6500) : null;
  const vRaw = c.visibility ?? H.visibility[h0], visMi = vRaw == null ? 10 : F() ? vRaw / 5280 : vRaw / 1609;
  let cat = 'VFR', col = '#22c55e';
  if ((ceiling != null && ceiling < 500) || visMi < 1) { cat = 'LIFR'; col = '#d946ef'; }
  else if ((ceiling != null && ceiling < 1000) || visMi < 3) { cat = 'IFR'; col = '#ef4444'; }
  else if ((ceiling != null && ceiling <= 3000) || visMi <= 5) { cat = 'MVFR'; col = '#3b82f6'; }
  const fz = H.freezing_level_height[h0];
  const fzTxt = fz == null ? '--' : F() ? Math.round(fz / 100) * 100 + ' ft' : Math.round(fz) + ' m';
  $('#aviation').innerHTML = `<div class="flex items-center gap-4 mb-4"><div class="text-center px-5 py-3 rounded-2xl border-2 shrink-0" style="border-color:${col};color:${col}"><div class="text-2xl font-extrabold tracking-wider">${cat}</div><div class="text-[10px] font-bold uppercase tracking-widest opacity-80">Flight cat.</div></div>
    <div class="text-sm text-zinc-400">Estimated from model visibility and cloud base. ${cat === 'VFR' ? 'Good flying weather.' : 'Reduced conditions; check official METARs before flying.'}</div></div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div class="stat"><div class="k">Ceiling</div><div class="v">${ceiling == null ? 'None' : ceiling.toLocaleString() + ' ft'}</div></div>
      <div class="stat"><div class="k">Cloud base</div><div class="v">${baseFt.toLocaleString()} ft</div></div>
      <div class="stat"><div class="k">Visibility</div><div class="v">${visMi >= 10 ? '10+' : visMi.toFixed(1)} sm</div></div>
      <div class="stat"><div class="k">Altimeter</div><div class="v">${(c.pressure_msl * 0.02953).toFixed(2)} inHg</div></div>
      <div class="stat"><div class="k">Freezing lvl</div><div class="v">${fzTxt}</div></div>
      <div class="stat"><div class="k">Surface wind</div><div class="v">${dirName(c.wind_direction_10m)} ${r0(c.wind_speed_10m)}G${r0(c.wind_gusts_10m)}</div></div>
      <div class="stat"><div class="k">Wind 80 m</div><div class="v">${r0(H.wind_speed_80m[h0])} ${wU()}</div></div>
      <div class="stat"><div class="k">Wind 120 m</div><div class="v">${r0(H.wind_speed_120m[h0])} ${wU()}</div></div>
      <div class="stat"><div class="k">Wind 180 m</div><div class="v">${r0(H.wind_speed_180m[h0])} ${wU()}</div></div>
    </div>`;
}

/* ---------- soil ---------- */
function renderSoil() {
  const H = S.D.hourly, d = S.D.daily, h0 = idxNow(), ti = todayIdx();
  const sm = H.soil_moisture_0_to_1cm[h0], sm2 = H.soil_moisture_1_to_3cm[h0], sm3 = H.soil_moisture_3_to_9cm[h0];
  const et = d.et0_fao_evapotranspiration[ti], vpd = H.vapour_pressure_deficit[h0];
  $('#soil').innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div><div id="g-soilm"></div><div class="text-center text-xs text-zinc-400">Soil moisture (surface)</div></div><div><div id="g-soilt"></div><div class="text-center text-xs text-zinc-400">Soil temp (6 cm)</div></div></div>
   <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
    <div class="stat"><div class="k">Soil 0 cm</div><div class="v">${deg(H.soil_temperature_0cm[h0])}</div></div>
    <div class="stat"><div class="k">Soil 18 cm</div><div class="v">${deg(H.soil_temperature_18cm[h0])}</div></div>
    <div class="stat"><div class="k">Moist 1-3 cm</div><div class="v">${sm2 == null ? '--' : Math.round(sm2 * 100) + '%'}</div></div>
    <div class="stat"><div class="k">Moist 3-9 cm</div><div class="v">${sm3 == null ? '--' : Math.round(sm3 * 100) + '%'}</div></div>
    <div class="stat"><div class="k">Evapotransp.</div><div class="v">${et == null ? '--' : (+et).toFixed(F() ? 2 : 1) + ' ' + pU()}</div></div>
    <div class="stat"><div class="k">VPD</div><div class="v">${vpd == null ? '--' : (+vpd).toFixed(2) + ' kPa'}</div></div></div>`;
  arcGauge('g-soilm', { value: sm == null ? null : sm * 100, min: 0, max: 50, unit: '%', stops: ['#d97706', '#84cc16', '#0ea5e9'], small: true, label: sm == null ? '' : sm < .15 ? 'Dry' : sm < .3 ? 'Moist' : 'Wet', labelColor: sm < .15 ? '#d97706' : sm < .3 ? '#84cc16' : '#0ea5e9' });
  const st = H.soil_temperature_6cm[h0], stF = st == null ? null : F() ? st : toF(st);
  arcGauge('g-soilt', { value: stF, min: 20, max: 100, display: st == null ? '--' : Math.round(st), unit: tU(), stops: ['#38bdf8', '#84cc16', '#f97316'], small: true, label: stF == null ? '' : stF < 50 ? 'Too cold to plant' : 'Good for growth', labelColor: stF < 50 ? '#38bdf8' : '#84cc16' });
}

/* ---------- smart recommendations ---------- */
function outdoorScore(i) {
  const H = S.D.hourly; const t = F() ? H.apparent_temperature[i] : toF(H.apparent_temperature[i]);
  const w = F() ? H.wind_speed_10m[i] : H.wind_speed_10m[i] / 1.609;
  let s = 100 - Math.abs(t - 70) * 1.6 - (H.precipitation_probability[i] || 0) * 0.5 - Math.max(0, w - 10) * 1.5 - (H.uv_index[i] > 8 ? 10 : 0);
  if (S.AQ && S.AQ.current && S.AQ.current.us_aqi > 100) s -= 20;
  return clamp(Math.round(s), 0, 100);
}
function renderRecos() {
  const c = S.D.current, H = S.D.hourly, d = S.D.daily, h0 = idxNow(), ti = todayIdx();
  const fl = F() ? c.apparent_temperature : toF(c.apparent_temperature);
  const pp = Math.max(0, ...H.precipitation_probability.slice(h0, h0 + 12).map(v => v || 0));
  const uv = d.uv_index_max[ti] ?? 0, aqi = S.AQ && S.AQ.current ? S.AQ.current.us_aqi : null;
  const gust = F() ? c.wind_gusts_10m : c.wind_gusts_10m / 1.609, tF = F() ? c.temperature_2m : toF(c.temperature_2m);
  const R = [];
  R.push(['ph-t-shirt', 'text-sky-300', 'Wear', fl < 25 ? 'Heavy coat, hat and gloves' : fl < 40 ? 'Warm jacket and layers' : fl < 55 ? 'Hoodie or light jacket' : fl < 70 ? 'Long sleeves or a light layer' : fl < 85 ? 'T-shirt and shorts weather' : 'Light, breathable clothes']);
  R.push(['ph-umbrella', 'text-blue-400', 'Umbrella', pp >= 60 ? `Bring one, ${pp}% rain chance in the next 12 hrs` : pp >= 30 ? `Maybe, ${pp}% chance later` : 'Not needed']);
  R.push(['ph-sun', 'text-yellow-400', 'Sunscreen', uv >= 6 ? `Yes, UV hits ${Math.round(uv)} today` : uv >= 3 ? 'A little for midday' : 'Not needed today']);
  if (aqi != null) R.push(['ph-leaf', 'text-green-400', 'Air', aqi <= 50 ? 'Clean air, open the windows' : aqi <= 100 ? 'OK for most people' : 'Limit hard outdoor exercise']);
  R.push(['ph-car', 'text-zinc-300', 'Driving', (c.visibility != null && (F() ? c.visibility < 5280 : c.visibility < 1600)) ? 'Low visibility, use low beams' : gust > 40 ? 'Strong gusts, careful on highways' : tF < 34 && pp > 30 ? 'Watch for icy spots' : 'Roads look fine']);
  let best = null, bs = -1;
  for (let i = h0; i < h0 + 18 && i < H.time.length; i++) { if (!H.is_day[i]) continue; const s = outdoorScore(i); if (s > bs) { bs = s; best = i; } }
  if (best != null) R.push(['ph-person-simple-run', 'text-orange-400', 'Best time outside', `${best === h0 ? 'Right now' : fmtHour(H.time[best])} (score ${bs})`]);
  $('#recoList').innerHTML = R.map(([ic, col, k, v]) => `<div class="flex items-start gap-2.5 text-sm"><i class="ph-fill ${ic} ${col} text-lg mt-0.5"></i><div><span class="text-zinc-500 text-[11px] font-semibold uppercase tracking-wide">${k}</span><div class="text-zinc-200">${esc(v)}</div></div></div>`).join('');
  const sc = outdoorScore(h0);
  arcGauge('g-outdoor', { value: sc, min: 0, max: 100, stops: ['#ef4444', '#facc15', '#22c55e'], label: sc < 40 ? 'Stay in' : sc < 70 ? 'OK' : 'Great', labelColor: sc < 40 ? '#ef4444' : sc < 70 ? '#facc15' : '#22c55e', small: true, aria: 'Outdoor score' });
  labelBelow('g-outdoor', 'Outdoor score now');
}

/* ---------- NWS ---------- */
function renderNWS() {
  const N = S.NWS, oEl = $('#nwsObs'), fEl = $('#nwsForecast');
  if (!N || N.none) { const msg = 'The National Weather Service only covers the U.S., so nothing to show for this spot.'; oEl.textContent = msg; fEl.textContent = msg; $('#obsLine').textContent = ''; return; }
  const o = N.obs;
  const T = v => v == null ? '--' : Math.round(F() ? toF(v) : v) + '°';
  if (o) {
    const cv = q => q && q.value != null ? q.value : null;
    const t = cv(o.temperature), dp = cv(o.dewpoint), ws = cv(o.windSpeed), wg = cv(o.windGust), vis = cv(o.visibility), pr = cv(o.barometricPressure), rh = cv(o.relativeHumidity);
    const W = v => v == null ? '--' : Math.round(F() ? v / 1.609 : v) + ' ' + wU();
    const age = Math.max(0, Math.round((Date.now() - new Date(o.timestamp)) / 60000));
    oEl.innerHTML = `<div class="text-xs text-zinc-500 mb-3"><i class="ph ph-broadcast"></i> ${esc(N.station || N.sid)} (${esc(N.sid)}) · ${age} min ago</div>
     <div class="flex items-center gap-3 mb-3"><span class="text-4xl font-bold text-zinc-100">${T(t)}</span><span class="text-zinc-300">${esc(o.textDescription || '')}</span></div>
     <div class="grid grid-cols-2 gap-2"><div class="stat"><div class="k">Dew point</div><div class="v">${T(dp)}</div></div><div class="stat"><div class="k">Humidity</div><div class="v">${rh == null ? '--' : Math.round(rh) + '%'}</div></div>
     <div class="stat"><div class="k">Wind</div><div class="v">${W(ws)}${wg ? ' G' + Math.round(F() ? wg / 1.609 : wg) : ''}</div></div><div class="stat"><div class="k">Visibility</div><div class="v">${vis == null ? '--' : F() ? (vis / 1609).toFixed(1) + ' mi' : (vis / 1000).toFixed(1) + ' km'}</div></div>
     <div class="stat col-span-2"><div class="k">Pressure</div><div class="v">${pr == null ? '--' : F() ? (pr / 3386.39).toFixed(2) + ' inHg' : Math.round(pr / 100) + ' hPa'}</div></div></div>`;
    $('#obsLine').innerHTML = `<i class="ph ph-broadcast"></i> NWS ${esc(N.sid)} observed: ${T(t)} ${esc(o.textDescription || '')}`;
  } else oEl.textContent = 'No recent station report.';
  if (N.forecast && N.forecast.length) {
    fEl.innerHTML = `<div class="text-xs text-zinc-500 mb-1">NWS office ${esc(N.office || '')}${N.rel ? ' · near ' + esc(N.rel.city) + ', ' + esc(N.rel.state) : ''}</div>` + N.forecast.slice(0, 10).map(p => `<div class="flex gap-3 p-3 rounded-2xl border border-zinc-800/60" style="background:var(--card2)"><div class="w-24 shrink-0"><div class="font-semibold text-zinc-100 text-[13px]">${esc(p.name)}</div><div class="text-lg font-bold ${p.isDaytime ? 'text-orange-300' : 'text-sky-300'}">${F() ? p.temperature : Math.round((p.temperature - 32) * 5 / 9)}°</div></div><div class="text-zinc-300 text-[13px] leading-snug">${esc(p.detailedForecast)}</div></div>`).join('');
  } else fEl.textContent = 'Official forecast unavailable right now.';
}

/* ---------- AI assistant (Pollinations, keyless) ---------- */
function buildCtx() {
  const D = S.D; if (!D) return null; const c = D.current, d = D.daily, H = D.hourly, h0 = idxNow(), ti = todayIdx();
  const o = { location: S.loc.name, local_time: c.time, units: { temperature: tU(), wind: wU(), precipitation: pU() },
    now: { condition: wx(c.weather_code).text, temp: c.temperature_2m, feels_like: c.apparent_temperature, humidity_pct: c.relative_humidity_2m, wind: c.wind_speed_10m, wind_dir: dirName(c.wind_direction_10m), gusts: c.wind_gusts_10m, cloud_pct: c.cloud_cover, dew_point: c.dew_point_2m, pressure_hPa: c.pressure_msl, uv_index: c.uv_index },
    next_24h_every_3h: [], next_7_days: [] };
  for (let i = h0; i < h0 + 24 && i < H.time.length; i += 3) o.next_24h_every_3h.push({ time: H.time[i], condition: wx(H.weather_code[i]).text, temp: H.temperature_2m[i], feels_like: H.apparent_temperature[i], rain_chance_pct: H.precipitation_probability[i], wind: H.wind_speed_10m[i], gusts: H.wind_gusts_10m[i] });
  for (let i = ti; i < ti + 7 && i < d.time.length; i++) o.next_7_days.push({ date: d.time[i], condition: wx(d.weather_code[i]).text, high: d.temperature_2m_max[i], low: d.temperature_2m_min[i], rain_chance_pct: d.precipitation_probability_max[i], precip_total: d.precipitation_sum[i], max_wind: d.wind_speed_10m_max[i], uv_max: d.uv_index_max[i] });
  if (ti > 0) o.yesterday = { high: d.temperature_2m_max[ti - 1], low: d.temperature_2m_min[ti - 1], precip_total: d.precipitation_sum[ti - 1] };
  if (S.AQ && S.AQ.current) o.air_quality = { us_aqi: S.AQ.current.us_aqi, category: aqiCat(S.AQ.current.us_aqi)[0], pm2_5: S.AQ.current.pm2_5 };
  if (S.MR && S.MR.current && S.MR.current.wave_height != null) o.marine = { wave_height: S.MR.current.wave_height, wave_period_s: S.MR.current.wave_period, sea_temp: S.MR.current.sea_surface_temperature };
  if (S.LY && S.LY.daily) o.same_day_last_year = { high: S.LY.daily.temperature_2m_max[0], low: S.LY.daily.temperature_2m_min[0] };
  if (S.ALERTS.length) o.active_nws_alerts = S.ALERTS.slice(0, 4).map(a => a.headline || a.event);
  return o;
}
const AI_SYS = "You are a friendly, concise weather assistant inside a weather app. Answer ONLY from the JSON weather data provided and never invent numbers. Use the units given. Lead with the key takeaway, mention timing of rain, wind or heat when relevant, and flag any active alerts or poor air quality. Plain text only, no tables or headings; short paragraphs or '- ' bullets. Keep it under 110 words unless asked for more.";
async function aiCall(msgs) {
  const d = await getJSON('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages: msgs, temperature: 0.5 }) }, 45000);
  const t = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!t) throw new Error('empty reply'); return t;
}
const fmtAI = t => esc(t).replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
async function aiAsk(q) {
  if (!S.D) return;
  q = (q || '').trim() || 'Summarize the weather for me: right now, the rest of today, and the next few days.';
  const out = $('#aiOut'), btn = $('#aiGo'); btn.disabled = true;
  if (!S.chat.length) out.innerHTML = '';
  const qd = document.createElement('div'); qd.className = 'text-zinc-500 text-xs font-semibold'; qd.textContent = 'You: ' + q;
  const ad = document.createElement('div'); ad.className = 'text-zinc-200'; ad.innerHTML = '<span class="animate-pulse text-zinc-500">Thinking...</span>';
  out.append(qd, ad); ad.scrollIntoView({ block: 'nearest' });
  const msgs = [{ role: 'system', content: AI_SYS + '\n\nCURRENT WEATHER DATA (JSON):\n' + JSON.stringify(buildCtx()) }, ...S.chat.slice(-6), { role: 'user', content: q }];
  try { const t = await aiCall(msgs); S.chat.push({ role: 'user', content: q }, { role: 'assistant', content: t }); ad.innerHTML = fmtAI(t); }
  catch (e) { ad.innerHTML = `<span class="text-zinc-500">Couldn't reach the AI right now (${esc(e.message)}). Try again in a moment.</span>`; }
  finally { btn.disabled = false; ad.scrollIntoView({ block: 'nearest' }); }
}
function bindAI() {
  [['Summarize', ''], ['What to wear?', 'What should I wear today and tomorrow?'], ['Best time outside?', 'What is the best time window today to be outside?'], ['Any risks?', 'Are there any weather, air quality or alert risks I should know about?'], ['Vs yesterday', 'How does today compare with yesterday?']].forEach(([l, q]) => {
    const b = document.createElement('button'); b.className = 'ai-chip'; b.textContent = l; b.type = 'button'; b.onclick = () => aiAsk(q); $('#aiChips').append(b);
  });
  $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#aiInput').value; $('#aiInput').value = ''; aiAsk(v); });
}

/* ---------- export / share ---------- */
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function exportData() {
  if (!S.D) return;
  const d = S.D.daily, ti = todayIdx(), rows = [['date', 'condition', 'high_' + tU(), 'low_' + tU(), 'rain_chance_pct', 'precip_' + pU(), 'max_wind_' + wU(), 'uv_max']];
  for (let i = ti; i < ti + 14 && i < d.time.length; i++) rows.push([d.time[i], wx(d.weather_code[i]).text, d.temperature_2m_max[i], d.temperature_2m_min[i], d.precipitation_probability_max[i], d.precipitation_sum[i], d.wind_speed_10m_max[i], d.uv_index_max[i]]);
  const slug = S.loc.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download(`nexus-${slug}-14day.csv`, rows.map(r => r.join(',')).join('\n'), 'text/csv');
  download(`nexus-${slug}-full.json`, JSON.stringify({ location: S.loc, model: S.model, forecast: S.D, air: S.AQ, marine: S.MR, last_year: S.LY, nws_alerts: S.ALERTS }, null, 1), 'application/json');
  toast('Downloaded 14-day CSV + full JSON');
}
async function share() {
  if (!S.loc) return;
  const u = new URL(location.href.split('?')[0]); u.searchParams.set('lat', S.loc.lat); u.searchParams.set('lon', S.loc.lon); u.searchParams.set('name', S.loc.name);
  const text = S.D ? `${S.loc.name}: ${Math.round(S.D.current.temperature_2m)}° ${wx(S.D.current.weather_code).text}` : S.loc.name;
  if (navigator.share) { try { await navigator.share({ title: 'NEXUS Ultimate', text, url: u.toString() }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(u.toString()); toast('Link copied'); } catch { prompt('Copy this link:', u.toString()); }
}

/* ---------- theme / units / model ---------- */
function applyTheme() {
  document.documentElement.classList.toggle('light', S.theme === 'light');
  document.documentElement.classList.toggle('dark', S.theme !== 'light');
  $('#themeBtn').innerHTML = `<i class="ph ${S.theme === 'light' ? 'ph-moon' : 'ph-sun'} text-xl"></i>`;
  document.querySelector('meta[name=theme-color]').content = S.theme === 'light' ? '#f4f4f5' : '#09090b';
}
function applyUnitUI() { $('#unitToggle').classList.toggle('c', !F()); $('#unitToggle').setAttribute('aria-checked', String(!F())); }
function bindControls() {
  $('#gpsBtn').onclick = () => useGPS(false);
  const tog = () => { S.unit = F() ? 'C' : 'F'; lsSet('unit', S.unit); applyUnitUI(); S.D = null; loadAll(false); };
  $('#unitToggle').onclick = tog; $('#unitToggle').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } };
  $('#modelSelect').value = S.model;
  $('#modelSelect').onchange = e => { S.model = e.target.value; lsSet('model', S.model); loadAll(false).then(() => toast('Model: ' + e.target.selectedOptions[0].textContent)); };
  $('#themeBtn').onclick = () => { S.theme = S.theme === 'light' ? 'dark' : 'light'; lsSet('theme', S.theme); applyTheme(); setBase(); if (S.D) { safe(renderCharts); safe(renderModels); } };
  $('#saveBtn').onclick = () => { if (!S.loc) return; if (S.saved.some(l => Math.abs(l.lat - S.loc.lat) < .01 && Math.abs(l.lon - S.loc.lon) < .01)) return toast('Already saved'); S.saved.push({ lat: S.loc.lat, lon: S.loc.lon, name: S.loc.name }); lsSet('saved', S.saved); renderSaved(); toast('Saved ' + S.loc.name); };
  $('#shareBtn').onclick = share; $('#exportBtn').onclick = exportData;
  document.querySelectorAll('#dailySeg button').forEach(b => b.onclick = () => { document.querySelectorAll('#dailySeg button').forEach(x => x.classList.toggle('on', x === b)); S.days = +b.dataset.d; if (S.D) renderDaily(); });
}

/* ---------- boot ---------- */
async function boot() {
  applyTheme(); applyUnitUI(); buildGaugeGrid(); buildDeepGrid(); bindSearch(); bindControls(); bindAI(); renderSaved();
  const q = new URLSearchParams(location.search);
  if (q.get('lat') && q.get('lon')) await setLocation({ lat: +q.get('lat'), lon: +q.get('lon'), name: q.get('name') || await reverseName(q.get('lat'), q.get('lon')) });
  else if (!(await useGPS(true))) {
    const last = ls('last', null);
    await setLocation(last || { lat: 41.5868, lon: -93.625, name: 'Des Moines, IA' });
    toast(last ? 'Showing your last location. Tap the arrow to use GPS.' : 'Location is off. Showing Des Moines. Search or tap the arrow.');
  }
  // refresh while the app is open, at the interval picked in Notifications ("Check every"), default 10 min
  let lastAuto = Date.now();
  setInterval(() => { const ev = (+(ls('push', {}).every) || 10) * 60000; if (!document.hidden && Date.now() - lastAuto >= ev) { lastAuto = Date.now(); loadAll(false); } }, 30000);
  document.addEventListener('visibilitychange', () => { const ev = (+(ls('push', {}).every) || 10) * 60000; if (!document.hidden && Date.now() - lastAuto >= ev) { lastAuto = Date.now(); loadAll(false); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.updated && Date.now() - S.updated > 10 * 60 * 1000) loadAll(false); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

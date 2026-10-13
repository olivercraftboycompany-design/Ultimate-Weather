/* NEXUS Ultimate service worker. Bump VERSION when you change files so phones get the update. */
const VERSION = 'nexus-v4';
importScripts('push-box.js');

const SHELL = [
  './', './index.html', './app.js', './extras.js', './push-box.js', './style.css', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/badge-96.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
// Libraries from CDNs that are safe to keep offline. Weather APIs, radar and map tiles are NEVER touched.
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@phosphor-icons/web@2.1.1',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => fetch(u, { mode: 'cors' }).catch(() => fetch(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== 'uw-config') await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (!CDN_HOSTS.includes(url.hostname)) return; // APIs, radar, tiles: straight to the network
    e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }
  })());
});

/* ---------- push notifications ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'NEXUS Weather';
  const opts = {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.tag || 'nexus',
    // Live updates send renotify:false + the same tag, so each one quietly replaces the last instead of stacking
    renotify: d.renotify !== false,
    silent: !!d.silent,
    requireInteraction: !!d.sticky,
    ...(d.silent ? {} : { vibrate: d.sticky ? [200, 100, 200, 100, 200] : [120, 60, 120] }), // silent + vibrate is a TypeError
    timestamp: d.ts || Date.now(),
    data: { url: d.url || './' }
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'nx-push', title, body: opts.body, tag: opts.tag });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        if (w.url !== target && 'navigate' in w) { try { await w.navigate(target); } catch {} }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// If the browser rotates the push subscription, re-subscribe and tell the sender.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const cfgRes = await (await caches.open('uw-config')).match('./uw-config.json');
    if (!cfgRes) return;
    const cfg = await cfgRes.json();
    if (!cfg.on) return;
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: self.UWPush.b64u.dec(self.UWPush.VAPID_PUBLIC) });
    await self.UWPush.post({ ...cfg.payload, type: 'sub', sub: sub.toJSON(), ts: Date.now() });
  })());
});

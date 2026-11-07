// App shell: network-first (always fresh when online, cached when not).
// Versioned third-party files (Firebase SDK, fonts, QR lib): cache-first, so the app opens with weak signal.
const CACHE = 'sk-v45';
const ASSETS = ['./', './index.html', './fonts/hanken-grotesk.woff2', './fonts/hanken-grotesk-italic.woff2', './app.js', './store.js', './scoring.js', './avatars.js', './i18n.js', './crew.js', './firebase-config.js', './styles.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png'];
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const VENDOR = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-database.js'];
const VENDOR_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    // Straight from the server, not the browser's HTTP cache (GitHub Pages lets files sit there for
    // 10 minutes), so a new version never installs with old files.
    await c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(VENDOR.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // A fresh request from the URL: a navigation request can't take options, and 'no-cache' makes the
    // browser check with the server instead of trusting its 10-minute HTTP cache.
    const net = fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; });
    // Weak signal: if the network hasn't answered in 2.5 s and we have a copy, show that (the fetch still refreshes the cache).
    e.respondWith(Promise.race([net.catch(() => null), new Promise(res => setTimeout(() => res(null), 2500))])
      .then(r => r || caches.match(e.request).then(hit => hit || net)));
  } else if (VENDOR_HOSTS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
  }
});

// service-worker.js — caches the app shell so Budget opens instantly and
// works offline. Data itself lives in localStorage/IndexedDB on the device,
// not in this cache, so offline use never shows stale numbers.

const CACHE_NAME = 'budget-app-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/main.js',
  './js/store.js',
  './js/idb.js',
  './js/sync.js',
  './js/charts.js',
  './js/format.js',
  './js/components.js',
  './js/views/dashboard.js',
  './js/views/transactions.js',
  './js/views/categories.js',
  './js/views/accounts.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Network-first for navigation/app files (so updates land quickly when
// online), falling back to the cache when offline. Cache-first for
// everything else.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isAppFile = APP_SHELL.some((path) => req.url.endsWith(path.replace('./', '/')));
  if (req.mode === 'navigate' || isAppFile) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

const CACHE = 'overworld-v11';
const ASSETS = [
  '/overworld/',
  '/overworld/index.html',
  '/overworld/styles.css',
  '/overworld/app.js',
  '/overworld/data.js',
  '/overworld/map.png',
  '/overworld/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

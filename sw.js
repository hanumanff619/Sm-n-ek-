const CACHE_NAME = 'smenarek21-cache-1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './namedays_cs.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './backgrounds/bg12.jpg',
  './backgrounds/bg8.jpg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k!==CACHE_NAME ? caches.delete(k) : null)))).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isHTML = req.headers.get('accept')?.includes('text/html');
  const isJS = req.destination === 'script';
  if (isHTML || isJS) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  } else {
    e.respondWith(caches.match(req).then(c => c || fetch(req)));
  }
});
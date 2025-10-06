// Směnářek SW v15 – network-first pro app a HTML
const CACHE = 'smenarek-cache-v15';
const ASSETS = ['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))) .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isCritical = url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.js');
  if (isCritical) {
    e.respondWith(fetch(e.request).then((res)=>{ const copy=res.clone(); caches.open(CACHE).then((c)=>c.put(e.request,copy)); return res; }).catch(()=>caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then((r)=>r||fetch(e.request)));
  }
});

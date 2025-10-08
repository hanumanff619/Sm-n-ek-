// SW v180 – cache bump
const CACHE='smenarek-cache-v180';
const ASSETS=['./','./index.html','./app_v180.js?v=180','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./namedays_cz.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))) .then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  const critical = u.pathname.endsWith('/app_v180.js') || u.pathname.endsWith('/index.html') || u.pathname.endsWith('/namedays_cz.json');
  if(critical){
    e.respondWith(fetch(e.request).then(res=>{const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return res;}).catch(()=>caches.match(e.request)));
  }else{
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});

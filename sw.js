/* RETIRED WORKER — self-destruct.
   Caching this app caused devices to keep running old builds, which made
   shipped fixes look broken. This worker now removes itself and every
   cache it created, then reloads open pages onto the live version. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.registration.unregister(); })
      .then(function(){ return self.clients.matchAll({type:'window'}); })
      .then(function(cs){ cs.forEach(function(c){ if('navigate' in c) c.navigate(c.url); }); })
  );
});
/* No fetch handler at all — every request goes straight to the network. */

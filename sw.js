// HSE Directory — Offline Service Worker
// Caches the main page so emergency info works without internet
var CACHE_NAME = 'hse-dir-v1';
var MAIN_PAGE  = '/hse-aura-directory/index.html';

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.add(MAIN_PAGE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  // Only intercept navigation (page load) requests
  if(event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request, {cache:'no-cache'}).then(function(response){
      // Online: update the cache with the fresh page
      var toCache = response.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(MAIN_PAGE, toCache); });
      return response;
    }).catch(function(){
      // Offline: serve cached page
      return caches.match(MAIN_PAGE);
    })
  );
});

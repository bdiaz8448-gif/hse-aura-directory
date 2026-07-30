/* AURA HSE Directory — Service Worker  (v4)
 *
 * CRITICAL RULE: This worker ONLY caches the static app shell.
 * It must NEVER touch Firestore / Firebase traffic. Firestore keeps a
 * long-lived polling channel open for real-time sync; if a Service Worker
 * intercepts, caches, or replays those requests, live sync silently dies
 * and the app reports itself as "Offline" even on a good connection.
 *
 * Anything not explicitly in SHELL is passed straight through to the
 * network with no interception whatsoever.
 */
const CACHE = 'aura-hse-canonical-v1';

/* Only these get cached — the page itself and the Firebase library files.
   The Firebase LIBRARIES are static CDN scripts and are safe to cache.
   The Firebase DATA endpoints are not, and are excluded below. */
const SHELL = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js'
];

/* Any URL containing one of these fragments is NEVER intercepted.
   These are live data channels — caching them breaks real-time sync. */
const NEVER_INTERCEPT = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'googleapis.com/google.firestore',
  'firebaseinstallations.googleapis.com',
  'firebaseremoteconfig.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  '/google.firestore.v1.Firestore/',
  'channel?',          // Firestore long-poll channel
  'gsessionid',        // Firestore session param
  'firebase-messaging'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll fails the whole install if any single item 404s — add individually
      return Promise.all(SHELL.map(function(u){
        return c.add(u).catch(function(){ /* ignore individual failures */ });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){
      return self.clients.claim();
    }).then(function(){
      /* A new worker version just took over. Any page currently open is
         still showing HTML that the OLD worker served from its cache.
         Force those pages to reload so the user sees the update straight
         away instead of having to manually clear website data. */
      return self.clients.matchAll({type:'window'}).then(function(clients){
        clients.forEach(function(c){
          if('navigate' in c) { c.navigate(c.url); }
        });
      });
    })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  var url = req.url;

  // 1. Never touch anything but GET
  if(req.method !== 'GET') return;

  // 2. Never touch non-http schemes (blob:, data:, chrome-extension:)
  if(url.indexOf('http') !== 0) return;

  // 3. NEVER touch Firebase/Firestore live data — this is the sync channel
  for(var i = 0; i < NEVER_INTERCEPT.length; i++){
    if(url.indexOf(NEVER_INTERCEPT[i]) !== -1) return;
  }

  // 4. Never touch requests the browser marks as non-cacheable
  if(req.cache === 'no-store' || req.headers.get('range')) return;

  // 5. The main page: ALWAYS go to the network first and bypass the HTTP
  //    cache entirely. Only fall back to the cached copy if genuinely
  //    offline. This guarantees a deployed update is never masked by a
  //    stale cached page.
  if(req.mode === 'navigate' || url.indexOf('.html') > -1){
    e.respondWith(
      fetch(req, {cache:'reload'}).then(function(resp){
        if(resp && resp.status === 200){
          var c2 = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(req, c2).catch(function(){}); });
        }
        return resp;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 6. Everything else: network-first, fall back to cache when truly offline
  e.respondWith(
    fetch(req).then(function(resp){
      // Only cache successful, basic/cors responses
      if(resp && resp.status === 200 && resp.type !== 'opaque'){
        var clone = resp.clone();
        caches.open(CACHE).then(function(c){
          c.put(req, clone).catch(function(){});
        });
      }
      return resp;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match('./index.html');
      });
    })
  );
});

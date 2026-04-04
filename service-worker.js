/* Pocket Balancer — Service Worker
   Cache-first strategy for full offline support */

var CACHE_NAME = 'pocket-balancer-v1';

var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700&display=swap'
];

/* ── INSTALL: pre-cache shell ──────────────────────────────── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE: clean old caches ────────────────────────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── FETCH: cache-first, network fallback ──────────────────── */
self.addEventListener('fetch', function(event) {
  /* Skip non-GET and chrome-extension requests */
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        /* Only cache valid responses */
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(function() {
        /* If both cache and network fail, return offline fallback */
        return caches.match('/index.html');
      });
    })
  );
});

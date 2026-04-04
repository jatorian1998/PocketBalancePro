/* ═══════════════════════════════════════════════════════════════
   Pocket Balancer — Service Worker v2
   Strategy : Cache-first for app shell | Network-first for fonts
   Data      : localStorage — never touched by SW
   ═══════════════════════════════════════════════════════════════ */

'use strict';

var CACHE_NAME = 'pocket-balancer-v2';

/* All assets that must be available offline after first visit.
   Inline CSS/JS live inside index.html — one file, always cached. */
var APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* ── INSTALL ─────────────────────────────────────────────────── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        /* addAll is atomic — if any asset fails, install fails */
        return cache.addAll(APP_SHELL);
      })
      .then(function() {
        /* Skip waiting so the new SW activates without waiting for
           old tabs to close.  Data is in localStorage — safe. */
        return self.skipWaiting();
      })
      .catch(function(err) {
        console.warn('[SW] Install cache failed:', err);
      })
  );
});

/* ── ACTIVATE ────────────────────────────────────────────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) {
              console.info('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(function() {
        /* Take control of all open clients immediately so they
           use the new SW without needing a reload. */
        return self.clients.claim();
      })
  );
});

/* ── FETCH ───────────────────────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  var req = event.request;

  /* Only handle GET — POST/PUT touch localStorage via JS, not SW */
  if (req.method !== 'GET') return;

  /* Skip non-http(s) (chrome-extension://, etc.) */
  if (!req.url.startsWith('http')) return;

  /* ── Google Fonts: network-first, cache fallback ─────────── */
  if (req.url.includes('fonts.googleapis.com') ||
      req.url.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirstFonts(req));
    return;
  }

  /* ── App shell: cache-first, network fallback ─────────────── */
  event.respondWith(cacheFirst(req));
});

/* ── STRATEGIES ──────────────────────────────────────────────── */

function cacheFirst(req) {
  return caches.match(req).then(function(cached) {
    if (cached) {
      /* Serve cached version immediately */
      /* Silently revalidate in background for next visit */
      revalidateInBackground(req);
      return cached;
    }
    /* Not cached — fetch from network and cache it */
    return fetchAndCache(req).catch(function() {
      /* Offline and not cached — serve index.html for navigation */
      if (req.mode === 'navigate') {
        return caches.match('/index.html');
      }
      return new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    });
  });
}

function networkFirstFonts(req) {
  return fetch(req)
    .then(function(response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(req, clone);
        });
      }
      return response;
    })
    .catch(function() {
      return caches.match(req);
    });
}

function fetchAndCache(req) {
  return fetch(req).then(function(response) {
    if (!response || response.status !== 200 ||
        response.type === 'error' || response.type === 'opaqueredirect') {
      return response;
    }
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      cache.put(req, clone);
    });
    return response;
  });
}

function revalidateInBackground(req) {
  /* Only revalidate app shell files, not every cached request */
  var url = new URL(req.url);
  var isShell = APP_SHELL.some(function(path) {
    return url.pathname === path || url.pathname === path.replace(/^\//, '');
  });
  if (!isShell) return;

  fetch(req).then(function(response) {
    if (response && response.ok) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(req, response);
      });
    }
  }).catch(function() { /* Network unavailable — ignore */ });
}

/* ── MESSAGE HANDLER ─────────────────────────────────────────── */
/* Allows the app page to communicate with SW if needed */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

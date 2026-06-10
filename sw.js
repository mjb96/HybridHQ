// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'hybrid-training-v33';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icon-512.png',
  './js/app.js',
  './js/constants.js',
  './js/analytics.js',
  './js/dashboard.js',
  './js/db.js',
  './js/dragdrop.js',
  './js/engine.js',
  './js/debug.js',
  './js/util.js',
  './js/garmin.js',
  './js/home.js',
  './js/state.js',
  './js/templates.js',
  './js/timers.js',
  './js/workout.js',
  './js/workout-map.js',
  './js/workout-exercise-picker.js',
  './js/workout-session-modals.js',
  './js/program_builder.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first for JS modules so bug fixes reach users immediately;
// fall back to cache only when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isJSModule = url.pathname.startsWith('/js/') || url.pathname.endsWith('.js');

  if (isJSModule) {
    // Network-first for JS
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for everything else (HTML, CSS, icons)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.log('[Service Worker] Network request failed, relying on cache.', err);
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});
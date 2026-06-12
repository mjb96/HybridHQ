// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'hybrid-training-v74';

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
  './js/schema.js',
  './js/debug.js',
  './js/util.js',
  './js/dates.js',
  './js/profile.js',
  './js/garmin.js',
  './js/home.js',
  './js/state.js',
  './js/templates.js',
  './js/timers.js',
  './js/workout.js',
  './js/workout-map.js',
  './js/workout-exercise-picker.js',
  './js/workout-session-modals.js',
  './js/program_builder.js',
  './js/builder-exercise-row.js',
  './js/builder-run-editor.js',
  './js/builder-progression.js',
  './js/builder-preview.js',

  // Hybrid Brain — intelligence layer
  './js/brain/constants_brain.js',
  './js/brain/load_models.js',
  './js/brain/analysis.js',
  './js/brain/attribution.js',
  './js/brain/insights.js',
  './js/brain/core.js',
  './js/brain/brain_dashboard.js',
  './js/brain/analytics_brain.js',
  './js/brain/exercise_metadata.js',
  './js/brain/session_fatigue.js',
  './js/brain/briefing.js'
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

// Network-first for code/markup/styles (JS, CSS, HTML) so fixes reach users on
// the next reload instead of being pinned to a stale cache. Only static media
// (icons/images/fonts) stays cache-first. Falls back to cache offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const p = url.pathname;
  const isNetworkFirst =
    p.startsWith('/js/') || p.endsWith('.js') ||
    p.endsWith('.css') || p.endsWith('.html') ||
    p === '/' || p.endsWith('/');

  if (isNetworkFirst) {
    // Network-first for code, styles and markup
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

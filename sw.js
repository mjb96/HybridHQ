// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'hybrid-training-v94';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icon-512.png',
  './js/app.js',
  './js/constants.js',
  './js/analytics.js',
  './js/dashboard-tiles.js',
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
  './js/toast.js',
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

  // Analytics — coordinator, charts, shared utils and per-tab views
  './js/analytics/charts.js',
  './js/analytics/utils.js',
  './js/analytics/views/_healthTrend.js',
  './js/analytics/views/view-strength.js',
  './js/analytics/views/view-running.js',
  './js/analytics/views/view-bodyweight.js',
  './js/analytics/views/view-recovery.js',
  './js/analytics/views/view-progress.js',
  './js/analytics/views/view-health-sleep.js',
  './js/analytics/views/view-health-steps.js',
  './js/analytics/views/view-health-rhr.js',

  // Metrics — aggregation helpers
  './js/metrics/metrics-load.js',
  './js/metrics/metrics-running.js',
  './js/metrics/metrics-strength.js',

  // Health — ingestion, calculations and settings
  './js/health/healthTypes.js',
  './js/health/healthService.js',
  './js/health/healthCalculations.js',
  './js/health/healthConnect.js',
  './js/health/healthSettings.js',
  './js/health/healthBaselines.js',

  // Hybrid Brain — intelligence layer
  './js/brain/constants_brain.js',
  './js/brain/insight_cards.js',
  './js/brain/load_models.js',
  './js/brain/analysis.js',
  './js/brain/attribution.js',
  './js/brain/insights.js',
  './js/brain/core.js',
  './js/brain/brain_dashboard.js',
  './js/brain/analytics_brain.js',
  './js/brain/exercise_metadata.js',
  './js/brain/session_fatigue.js',
  './js/brain/briefing.js',
  './js/brain/weekly_brief.js',
  './js/brain/daily_readiness.js',
  './js/brain/tradeoffs.js'
];

self.addEventListener('install', (event) => {
  // Activate this worker as soon as it's parsed — do NOT gate takeover on the
  // precache. cache.addAll() is all-or-nothing: a single missing/renamed asset
  // or one transient network blip during install would reject the whole thing,
  // leaving the new SW stuck in "waiting" while the OLD worker keeps serving
  // stale code indefinitely. That deadlock is exactly how the PWA gets pinned
  // to a broken build (the APK is immune — it never registers a SW). Calling
  // skipWaiting() here, before the precache, guarantees the new SW always takes
  // over on the next load regardless of precache outcome.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets');
      // Non-atomic precache: cache each asset independently so one failure
      // can't abort the rest. `cache: 'reload'` bypasses the HTTP cache so the
      // precache always pulls fresh bytes, not a stale browser-cached copy.
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[Service Worker] Skipped precaching', url, err);
          })
        )
      );
    })
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
            return networkResponse;
          }
          // Non-200 (404 mid-deploy, 5xx, opaque): a broken response for an ES
          // module aborts the whole import graph and white-screens the app.
          // Prefer the last known-good cached copy if we have one.
          return caches.match(event.request).then((cached) => cached || networkResponse);
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

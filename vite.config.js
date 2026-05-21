/**
 * BigTrades Service Worker — CORS-safe version
 *
 * ROOT CAUSE of sw.js errors:
 * The old sw.js was trying to cache API responses and return them as Response objects.
 * When a CORS error occurs, fetch() returns an "opaque" response that CANNOT be
 * converted to a cacheable Response — hence "Failed to convert value to 'Response'".
 * The SW was crashing on every API call, blocking ALL network requests.
 *
 * FIX: This SW only caches same-origin assets (the app shell).
 * ALL cross-origin API requests (api.bigtrades.veloxtrader.com) pass through
 * directly to the network — the SW never touches them.
 */

const CACHE_NAME = 'bigtrades-shell-v5';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

// Install: cache the app shell only
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: CRITICAL — never intercept cross-origin API requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let ALL cross-origin requests (API calls) go directly to network
  // Do NOT cache, do NOT intercept — just pass through
  if (url.origin !== self.location.origin) {
    return; // no event.respondWith() = browser handles normally
  }

  // For same-origin requests: serve from cache, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // If offline and not cached, return the app shell for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

const CACHE_NAME = 'docviewer-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  // Don't skipWaiting here — let revalidation handle activation
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: stale-while-revalidate ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests for same-origin or CDN assets
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For CDN requests (PDF.js, mammoth, SheetJS etc) — cache-first is fine
  // since they are versioned URLs that won't change
  const isCDN = !url.origin.includes(self.location.hostname);

  if (isCDN) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // For app shell — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) {
            cache.put(event.request, response.clone());
            // If we served stale and network returned something new,
            // notify all clients to reload on next open
            notifyClientsOfUpdate();
          }
          return response;
        }).catch(() => null);

        return cached || networkFetch;
      })
    )
  );
});

// ── Message: manual skipWaiting trigger from client ──────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

let updateNotified = false;
function notifyClientsOfUpdate() {
  if (updateNotified) return;
  updateNotified = true;
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.postMessage('SW_UPDATED'));
  });
}

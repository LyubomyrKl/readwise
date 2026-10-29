// Service Worker for PWA: the app shell's static files and an offline page.
// It never caches pages or API responses: they belong to a signed-in user and
// must not outlive the session (logout also clears these caches).
// v2: v1 cached every GET, API responses included; activating v2 deletes it.
const CACHE_NAME = 'workbench-v2';
const OFFLINE_URL = '/offline';

// Assets to pre-cache on install
const PRECACHE_ASSETS = ['/offline', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Same-origin files that are the same for everyone: Next's hashed build output, icons, the manifest. */
function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === OFFLINE_URL
  );
}

// Install event - pre-cache essential assets and take over at once: the worker
// only keeps hashed static files, so an open page can go on under it (the page
// does not reload itself for it).
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)));
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: the network, or the offline page when there is none (never a stored copy of a page)
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Everything else that is not a static file (API calls, RSC payloads, the job stream) is left alone
  if (!isStatic(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

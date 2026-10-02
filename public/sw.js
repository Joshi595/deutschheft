// Offline support. Pages and assets are cached as they are visited, so any
// lesson opened once keeps working without a connection.
//
// Pages: network first, so a new deploy shows up straight away; cache as fallback.
// Hashed assets (/_astro/…): cache first, since their names change when they do.

const CACHE = 'deutschheft-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const store = async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  };

  if (url.pathname.includes('/_astro/')) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then(store)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(store)
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  );
});

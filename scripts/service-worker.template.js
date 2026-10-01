// Generated with one complete set of assets per build.
const PREFIX = `attendance:${self.registration.scope}:`;
const CACHE = PREFIX + __BUILD_ID__;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    FILES.map((file) => new Request(new URL(file, self.registration.scope), { cache: 'reload' })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? new URL('./', scope).href : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(req); }
    catch { return Response.error(); }
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await clients.claim();
    for (const key of await caches.keys()) await caches.delete(key);
  })());
});
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
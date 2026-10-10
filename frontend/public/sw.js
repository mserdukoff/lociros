const CACHE = "lociros-offline-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/manifest.json"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (req.mode === "navigate" || req.destination === "document") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || Promise.reject())),
    );
    return;
  }
  // Only content-hashed or rarely changing files are safe to serve cache-first;
  // RSC payloads for client navigation must always come from the network.
  const cacheable =
    url.origin === self.location.origin &&
    !url.searchParams.has("_rsc") &&
    !req.headers.has("RSC") &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/art/") ||
      ["image", "font"].includes(req.destination));
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Minimaler Service Worker: App-Shell offline-fähig, API immer aus dem Netz.
const CACHE = "northflow-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // API niemals cachen.
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  // Navigationsanfragen: Netz zuerst, Fallback auf gecachte Shell.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  // Statische Assets: Cache zuerst, sonst Netz (und nachladen).
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
    )
  );
});

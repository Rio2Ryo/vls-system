// VLS Service Worker — Offline support for check-in and photo viewing
const CACHE_NAME = "vls-pwa-v1";

// App shell pages to pre-cache on install
const APP_SHELL = [
  "/",
  "/scan",
  "/demo",
  "/survey",
  "/processing",
  "/photos",
  "/complete",
];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails if any request fails — use individual puts as fallback
      Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(url)
            .then((res) => {
              if (res.ok) cache.put(url, res);
            })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: purge old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
        )
      )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations handled by IndexedDB queue in app)
  if (request.method !== "GET") return;

  // Skip API routes — let them fail naturally so app can queue
  if (url.pathname.startsWith("/api/")) return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip Sentry tunnel
  if (url.pathname.startsWith("/monitoring")) return;

  // Static assets (/_next/static/*, images, fonts): cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|css|js)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // HTML navigation: network-first, fall back to cache
  if (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/"))
            .then((fallback) => fallback || new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // Other GET requests: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

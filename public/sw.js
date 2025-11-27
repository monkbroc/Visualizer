const VERSION = "v3";
const CACHE_NAME = `pedro-visualizer-${VERSION}`;

// Resources that truly never change:
const APP_STATIC_RESOURCES = [
  "/favicon.ico",
  "/robot.png",
  "/fields/centerstage.webp",
  "/fields/intothedeep.webp",
  "/fields/decode.webp",
  "/fonts/Poppins-Regular.ttf",
  "/fonts/Poppins-SemiBold.ttf",
  "/fonts/Poppins-Light.ttf",
  "/fonts/Poppins-ExtraLight.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_STATIC_RESOURCES))
  );
  self.skipWaiting(); // update immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        })
      );
      await clients.claim();
    })()
  );
});

// Fetch Strategy:
// - HTML navigation → network first, cache fallback
// - API requests → network only
// - Static assets (hashed) → cache first, network fallback
// - Runtime assets → cache-on-demand

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // --- SPA navigation: NETWORK FIRST ---
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // get fresh index.html
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          // fallback to cached index.html if offline
          return caches.match("/") || Response.error();
        }
      })()
    );
    return;
  }

  // --- Allow FPA API requests straight through ---
  if (url.hostname.includes("fpa.pedropathing.com")) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({
            error: "offline",
            message: "You are offline. Please check your internet connection.",
          }),
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // --- For everything else: CACHE FIRST, then network ---
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response(null, { status: 404 });
      }
    })()
  );
});

const STATIC_CACHE = "hora-do-treino-static-v1";
const PAGE_CACHE = "hora-do-treino-pages-v1";
const PRECACHE_URLS = [
  "/",
  "/login",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/pwa/icon-72x72.png",
  "/pwa/icon-96x96.png",
  "/pwa/icon-128x128.png",
  "/pwa/icon-144x144.png",
  "/pwa/icon-152x152.png",
  "/pwa/icon-192x192.png",
  "/pwa/icon-384x384.png",
  "/pwa/icon-512x512.png",
  "/pwa/icon-192x192-maskable.png",
  "/pwa/icon-512x512-maskable.png"
];
const PRIVATE_PATH_PREFIXES = ["/admin", "/dashboard", "/perfil", "/results", "/api"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== PAGE_CACHE) {
            return caches.delete(key);
          }

          return Promise.resolve(false);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === "/sw.js") {
    return;
  }

  if (request.mode === "navigate") {
    if (isPrivatePath(url.pathname)) {
      event.respondWith(privateNavigation(request));
      return;
    }

    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isSensitiveEndpoint(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isSensitiveEndpoint(pathname) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname.startsWith("/pwa/") ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon-16x16.png" ||
    pathname === "/favicon-32x32.png" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/i.test(pathname)
  );
}

async function privateNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const fallback = await caches.match("/offline.html");
    return fallback || Response.error();
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    const fallback = await caches.match("/offline.html");
    return fallback || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

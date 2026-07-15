/* Cake Break storefront service worker
 *
 * Strategy overview (desktop + mobile):
 *  - Navigation (HTML): network-first → offline fallback page
 *  - Next.js static assets (/_next/static/*): cache-first
 *  - Same-origin images/fonts: stale-while-revalidate
 *  - API / cart / auth traffic: network-only (never cache)
 *
 * Keep this file dependency-free so it works with Next standalone Docker builds.
 */

const CACHE_VERSION = "cake-break-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline";

/** Precached shell — kept small so install stays fast on mobile networks. */
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
];

/** Paths that must always hit the network (auth, cart, checkout, APIs). */
const NETWORK_ONLY_PREFIXES = [
  "/api/",
  "/checkout-page",
  "/login",
  "/signup",
  "/account",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cake-break-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * @param {Request} request
 * @returns {boolean}
 */
function isNetworkOnly(request) {
  if (request.method !== "GET") return true;

  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return true;
    return NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  } catch {
    return true;
  }
}

/**
 * @param {Request} request
 * @returns {boolean}
 */
function isNextStaticAsset(request) {
  try {
    const url = new URL(request.url);
    return (
      url.origin === self.location.origin &&
      (url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/icons/") ||
        url.pathname === "/favicon.ico")
    );
  } catch {
    return false;
  }
}

/**
 * @param {Request} request
 * @returns {boolean}
 */
function isCacheableAsset(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return /\.(?:png|jpg|jpeg|svg|webp|gif|woff2?|ttf|css)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * @param {string} cacheName
 * @param {Request} request
 * @param {Response} response
 */
async function putInCache(cacheName, request, response) {
  if (!response || !response.ok) return;
  // Opaque cross-origin responses can be cached carefully; we only store same-origin.
  if (response.type !== "basic" && response.type !== "cors") return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

/**
 * Network-first for navigations; fall back to /offline when the device is offline.
 * @param {Request} request
 */
async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    // Keep a fresh copy of successful HTML navigations for soft offline revisits.
    if (networkResponse && networkResponse.ok) {
      await putInCache(RUNTIME_CACHE, request, networkResponse);
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("You are offline. Please reconnect and try again.", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * Cache-first for versioned Next.js assets (immutable hashed filenames).
 * @param {Request} request
 */
async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await putInCache(STATIC_CACHE, request, response);
    return response;
  } catch {
    return new Response("Asset unavailable offline", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

/**
 * Stale-while-revalidate for images / fonts / CSS.
 * @param {Request} request
 */
async function handleRuntimeAsset(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      await putInCache(RUNTIME_CACHE, request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Refresh in background; ignore failures.
    networkPromise.catch(() => {});
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return new Response("Resource unavailable offline", {
    status: 503,
    statusText: "Service Unavailable",
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (isNetworkOnly(request)) {
    return; // browser default network behaviour
  }

  // HTML navigations (address bar, link clicks, installed PWA launches)
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isNextStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(handleRuntimeAsset(request));
  }
});

// Allow the page to ask the SW to activate immediately after an update.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

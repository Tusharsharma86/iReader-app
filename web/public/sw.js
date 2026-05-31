const CACHE_VERSION = 'v26';
const STATIC_CACHE = `ireader-static-${CACHE_VERSION}`;
const API_CACHE = `ireader-api-${CACHE_VERSION}`;
const API_TTL_MS = 5 * 60 * 1000;

// Only pre-cache the app shell icons — NOT index.html
// index.html must always come from network so new JS bundles are loaded
const PRECACHE_ASSETS = [
  '/icons/icon-192.png?v=pro1',
  '/icons/icon-512.png?v=pro1',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  const isApiCall = url.hostname === 'ireader.onrender.com';
  const isFeedCall = isApiCall && url.pathname === '/api/news/feed';

  if (isApiCall) {
    event.respondWith(isFeedCall ? staleWhileRevalidate(request) : networkFirst(request));
    return;
  }

  // HTML files — always network first so deploys are picked up immediately
  if (request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Content-hashed assets (JS/CSS with fingerprint in filename) — cache forever
  if (/\/assets\/[^/]+-[A-Za-z0-9]{8}\.(js|css)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else — network first
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    fetchAndUpdate;
    return cached;
  }

  const fresh = await fetchAndUpdate;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ stories: [], error: 'offline' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

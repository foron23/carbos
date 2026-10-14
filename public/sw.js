const CACHE = 'carbos-__BUILD__';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.en.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match('./index.html');
    if (shell) return shell;
    throw new Error('offline sin cache');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch {
      // La escritura en Cache puede rechazar (p.ej. respuestas gzip grandes).
      // Un fallo de cache nunca debe tumbar la respuesta: degradamos a red.
    }
  }
  return response;
}

function isBarcodeAsset(url) {
  return url.pathname.includes('/barcode/') || url.pathname.endsWith('barcode-manifest.json');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBarcodeAsset(url)) {
    // Los packs ya viven en IndexedDB y son grandes: network-only, sin Cache.
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

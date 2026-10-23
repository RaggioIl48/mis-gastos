// Permite abrir la app sin conexión. Sirve lo guardado al instante y se
// actualiza en segundo plano cuando hay Internet. Los datos van aparte (Firestore).
const CACHE = 'mis-gastos-v3';
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logic.js',
  './store.js',
  './cloud.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  `${SDK}firebase-app.js`,
  `${SDK}firebase-auth.js`,
  `${SDK}firebase-firestore.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // El inicio de sesión de Firebase (/__/auth/...) nunca se sirve desde la caché.
  if (sameOrigin && url.pathname.startsWith('/__/')) return;

  // El SDK de Firebase tiene versión fija en la URL: se guarda una vez y no cambia.
  if (url.href.startsWith(SDK)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  if (!sameOrigin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return network;
  }));
});

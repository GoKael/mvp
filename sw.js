const CACHE = 'lexa-v2-8';
const APP_SHELL = [
  './index.html',
  './styles.css?v=14',
  './app.js?v=18',
  './lib/app-core.mjs?v=2',
  './lib/audio.mjs?v=2',
  './manifest.webmanifest',
  './assets/icon.svg',
  './server/data/core-100.json?v=4',
  './server/data/lessons.json?v=4',
  './server/data/patterns.json?v=4',
  './server/data/audio-manifest.json?v=4',
  './assets/audio/lessons/food-001-1-zh.mp3',
  './assets/audio/lessons/food-001-1-vi.mp3',
  './assets/audio/lessons/food-001-2-zh.mp3',
  './assets/audio/lessons/food-001-2-vi.mp3',
  './assets/audio/lessons/food-001-3-zh.mp3',
  './assets/audio/lessons/food-001-3-vi.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isData = url.pathname.includes('/server/data/');
  if (isData || event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => event.request.mode === 'navigate'
      ? caches.match('./index.html')
      : caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    }
    return response;
  })));
});

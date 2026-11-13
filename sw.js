const CACHE_NAME = 'aspos-virion-shell-v4';
const SHELL_ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Jangan cache API POST/JSONP ke Google Apps Script
  if (req.method !== 'GET' || req.url.includes('script.google.com')) return;

  event.respondWith(
    (req.mode === 'navigate' || req.url.endsWith('/index.html'))
      ? fetch(req).then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
      : caches.match(req).then(cached => {
          const fetchPromise = fetch(req).then(networkRes => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            }
            return networkRes;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
  );
});

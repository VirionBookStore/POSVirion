/* POSVirion Offline-First Service Worker
 * Cache app shell and UI libraries only. Never cache GAS/API responses or user data.
 */
'use strict';
const CACHE_PREFIX = 'posvirion-shell-';
const CACHE_VERSION = '2026-11-11-v1';
const SHELL_CACHE = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = ['./', './index.html'];
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(APP_SHELL.map(async url => {
      try { await cache.add(new Request(url, {cache:'reload'})); }
      catch (error) { console.warn('[POSVirion SW] Shell cache gagal:', url, error); }
    }));
    await Promise.all(CDN_ASSETS.map(async url => {
      try {
        const response = await fetch(url, {mode:'no-cors', cache:'reload'});
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn('[POSVirion SW] CDN cache gagal:', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isAppNavigation = request.mode === 'navigate' &&
    url.origin === self.location.origin;
  const isSameOriginAsset = url.origin === self.location.origin &&
    !url.pathname.includes('/macros/s/') &&
    !url.pathname.includes('/exec');
  const isKnownCdn = CDN_ASSETS.some(asset => asset === url.href);

  // Network-first for the HTML shell so updates are adopted when online.
  if (isAppNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put('./index.html', response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        return (await cache.match(request)) ||
          (await cache.match('./index.html')) ||
          new Response('POSVirion belum pernah dibuka online pada perangkat ini. Hubungkan internet untuk pemuatan pertama.', {
            status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}
          });
      }
    })());
    return;
  }

  // Cache only the app shell/static assets and the explicitly listed UI libraries.
  // GAS calls, POST requests, and dynamic data are deliberately excluded.
  if (isSameOriginAsset || isKnownCdn) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});

const CACHE_NAME = 'busgo-pwa-v1782077407935';
const FONTS_CACHE = 'busgo-fonts-v1782077407935';
const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// Precache core assets + requested resources
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-512x512.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/src/components/SplashScreen.jsx',
  // Transport Icons & SVGs
  '/src/assets/busstationbox.png',
  '/src/assets/stationbox.png',
  '/src/assets/night-icon.png',
  '/src/assets/tram-icon.png',
  // Metro PNGs (Converted from SVGs)
  '/src/assets/metroA-icon.png',
  '/src/assets/metroB-icon.png',
  '/src/assets/metroC-icon.png',
  '/src/assets/train-icon.png',
  '/src/assets/ferry-icon.png',
  '/src/assets/trolleybus-icon.png',
  // Dimmed Variants
  '/src/assets/bus-icon-dimmed.png',
  '/src/assets/tram-icon-dimmed.png',
  '/src/assets/metroA-icon-dimmed.png',
  '/src/assets/metroB-icon-dimmed.png',
  '/src/assets/metroC-icon-dimmed.png',
  '/src/assets/train-icon-dimmed.png',
  '/src/assets/ferry-icon-dimmed.png',
  '/src/assets/trolleybus-icon-dimmed.png',
  '/src/assets/night-icon-dimmed.png',
  'https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap',
  'https://fonts.gstatic.com/s/onest/v1/Onest-VariableFont_wght.woff2',
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
  event.waitUntil(
    (async () => {
      const coreCache = await caches.open(CACHE_NAME);
      for (const url of ASSETS_TO_CACHE) {
        try {
          await coreCache.add(url);
        } catch (e) {
          console.warn('[SW] Failed to cache', url, e);
        }
      }
      try {
        const fontsCache = await caches.open(FONTS_CACHE);
        await fontsCache.add('https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap');
      } catch (e) {
        console.warn('[SW] Failed to warm fonts CSS cache', e);
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clear all unwanted caches (anything not current)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== FONTS_CACHE)
          .map((name) => caches.delete(name))
      );
      // Immediately take control of all open clients
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  // CRITICAL: Always bypass cache for version.json to ensure the app knows when to update
  if (reqUrl.pathname.includes('version.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Runtime caching for Google Fonts CSS and font files (cache-first)
  if (reqUrl.origin === 'https://fonts.googleapis.com' || reqUrl.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FONTS_CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (resp && resp.ok) {
            cache.put(event.request, resp.clone());
          }
          return resp;
        } catch (e) {
          const fallback = await cache.match('https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap');
          if (fallback) return fallback;
          throw e;
        }
      })()
    );
    return;
  }

  // Ensure SplashScreen, Icons, or built asset variants are cached when requested
  if (reqUrl.pathname.startsWith('/src/assets/') ||
    reqUrl.pathname.startsWith('/assets/') ||
    /\.(png|svg|jpg|jpeg|webp|ico)$/i.test(reqUrl.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const resp = await fetch(event.request);
        if (resp && resp.ok) cache.put(event.request, resp.clone());
        return resp;
      })()
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
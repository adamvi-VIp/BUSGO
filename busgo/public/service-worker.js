const CACHE_NAME = 'busgo-pwa-v2';
const FONTS_CACHE = 'busgo-fonts-v2';
const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// Precache core assets + requested resources
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-512x512.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  // Requested by user: dev module path for SplashScreen and Google Fonts assets
  '/src/components/SplashScreen.jsx',
  'https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap',
  // Note: the v1 path can 404; we will attempt gracefully and also rely on runtime caching for actual font URLs referenced by the CSS
  'https://fonts.gstatic.com/s/onest/v1/Onest-VariableFont_wght.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const coreCache = await caches.open(CACHE_NAME);
      // Attempt to precache assets one-by-one to avoid install failures when any single request errors
      for (const url of ASSETS_TO_CACHE) {
        try {
          await coreCache.add(url);
        } catch (e) {
          console.warn('[SW] Failed to cache', url, e);
        }
      }
      // Warm fonts cache with Google fonts CSS; actual font files will be runtime-cached on first use
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
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

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
          // Fallback to any cached CSS if available
          const fallback = await cache.match('https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap');
          if (fallback) return fallback;
          throw e;
        }
      })()
    );
    return;
  }

  // Ensure SplashScreen module or built asset variants are cached when requested (dev / build)
  if (reqUrl.pathname === '/src/components/SplashScreen.jsx' || /\/assets\/SplashScreen.*\.js$/.test(reqUrl.pathname)) {
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
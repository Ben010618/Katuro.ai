// Bumped from katuro-v1 -- the old cache name never changed across deploys,
// so activate()'s cleanup never actually purged anything. Bumping it here
// forces every existing install (including any still registered from before
// the Render -> GitHub Pages migration) to drop its old cache on next activate.
const CACHE = 'katuro-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Only ever cache Vite's own hash-named build output (/assets/*.js, *.css,
  // etc.) -- the filename changes whenever the content does, so it's safe to
  // cache indefinitely and serve cache-first.
  //
  // Everything else -- and *especially* navigation requests / index.html --
  // is deliberately left alone (no caching, no interception at all). This
  // used to cache-and-serve the app shell too, which is exactly what caused
  // "Failed to fetch dynamically imported module": a browser holding an old
  // cached index.html would keep referencing hash-named chunks that a later
  // deploy had already replaced, and no amount of asset caching can be safe
  // once the page that names those assets is itself stale. Letting
  // navigations/index.html always hit the network guarantees the page
  // always names whatever chunks are actually currently deployed.
  if (!url.pathname.startsWith('/assets/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// Offline play: on install, cache every file the game needs (precache.json lists them); then serve
// from that cache first. tools/build-web.mjs writes the build's version into VERSION below, so each
// new build is a new worker with its own cache. A new version waits until no game is running (the
// start screen hands over, see main.js), so a game in progress never mixes old and new files.
const VERSION = '__VERSION__';
const CACHE = 'nhg-' + VERSION;
const ROOT = new URL('../', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const list = await (await fetch(new URL('m/precache.json', ROOT), { cache: 'no-store' })).json();
    if (list.version !== VERSION) throw new Error('precache.json is from another build');
    const cache = await caches.open(CACHE);
    // past the browser's HTTP cache, a few at a time so a slow connection isn't swamped
    const files = list.files.map((f) => new Request(new URL(f, ROOT).href, { cache: 'reload' }));
    for (let i = 0; i < files.length; i += 16) await cache.addAll(files.slice(i, i + 16));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('nhg-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// the start screen asks a waiting new version to take over
self.addEventListener('message', (e) => { if (e.data === 'take-over') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(ROOT)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});

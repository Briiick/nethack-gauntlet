// Offline play: on install, cache every file the game needs (the list and its version come from
// precache.json, written by tools/build-web.mjs); then serve from the cache first. A new version
// takes over the next time the app is opened, never in the middle of a game.
const ROOT = new URL('../', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const list = await (await fetch(new URL('m/precache.json', ROOT), { cache: 'no-store' })).json();
    const cache = await caches.open('nhg-' + list.version);
    // a few at a time, so a phone on a slow connection isn't swamped
    const files = list.files.map((f) => new URL(f, ROOT).href);
    for (let i = 0; i < files.length; i += 16) await cache.addAll(files.slice(i, i + 16));
    await cache.put(new URL('m/version', ROOT).href, new Response(list.version));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = await currentCache();
    for (const k of await caches.keys()) if (k.startsWith('nhg-') && k !== keep) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function currentCache() {
  for (const k of (await caches.keys()).reverse()) {
    if (k.startsWith('nhg-') && await (await caches.open(k)).match(new URL('m/version', ROOT).href)) return k;
  }
  return null;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(ROOT)) return;
  e.respondWith((async () => {
    const name = await currentCache();
    const cache = name ? await caches.open(name) : null;
    const hit = cache && await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (cache && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});

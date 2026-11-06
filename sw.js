// Cache-first store for Stockfish engine files, so each build downloads once.
const CACHE = "chesscoach-engines-v1";
const isEngine = u => /\/assets\/js\/[^/]*(stockfish|\.wasm$|\.nnue$)/i.test(u.pathname) || /\.(wasm|nnue)$/i.test(u.pathname);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for(const k of await caches.keys()) if(k.startsWith("chesscoach-engines-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const r = e.request;
  if(r.method !== "GET" || r.headers.has("range")) return;
  const u = new URL(r.url);
  if(u.origin !== location.origin || !isEngine(u)) return;
  e.respondWith((async () => {
    try{
      const cache = await caches.open(CACHE);
      const hit = await cache.match(r, {ignoreSearch:true});
      if(hit) return hit;
      const res = await fetch(r);
      if(res.ok && res.status === 200){
        // Cache in the background: never block the engine's stream (and its progress bar).
        const copy = res.clone();
        e.waitUntil(cache.put(r, copy).catch(() => {}));
      }
      return res;
    }catch(err){
      return fetch(r);
    }
  })());
});


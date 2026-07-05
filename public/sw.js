// Service worker mínimo do Budget OS.
// Estratégia conservadora para não servir versão velha:
// - Navegações (páginas): network-first, com fallback ao cache se offline.
// - Assets versionados do Next (/_next/static) e ícones: cache-first (são
//   imutáveis por conterem hash no nome).
// Nada é pré-cacheado no install — o cache se popula conforme o uso.

const CACHE = "budget-os-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const chaves = await caches.keys();
      await Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function cacheavel(url) {
  return url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/manifest-icon") ||
    url.pathname === "/icon" || url.pathname === "/apple-icon";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deixa Supabase e afins passarem direto

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresca = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresca.clone());
          return fresca;
        } catch {
          const cache = await caches.open(CACHE);
          const cacheada = await cache.match(req);
          return cacheada ?? (await cache.match("/")) ?? Response.error();
        }
      })()
    );
    return;
  }

  if (cacheavel(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cacheada = await cache.match(req);
        if (cacheada) return cacheada;
        const fresca = await fetch(req);
        cache.put(req, fresca.clone());
        return fresca;
      })()
    );
  }
});

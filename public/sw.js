// ─────────────────────────────────────────────────────────────────────
// SW Kill-Switch — versao 2026-05-29
//
// O service worker anterior fazia Network-First mas ainda cacheava HTML
// e JS, segurando bundle antigo no navegador do motorista mesmo apos
// deploy novo. Sintoma: mapa nao aparecia, "limpa cache" virava workaround.
//
// Este SW substitui o anterior e faz auto-destruicao:
// 1. Ativa imediatamente (skipWaiting)
// 2. Limpa todos os caches da origem
// 3. Auto-unregistra
// 4. Reload em todas as abas abertas (pra carregarem sem SW)
//
// Apos isso, nenhum SW intercepta requests — usuario recebe sempre
// HTML/JS fresco direto do servidor (com cache-control normal do
// browser).
//
// Quando re-introduzir PWA, usar Workbox + estrategia diferente por
// tipo de asset (HTML: network-only; JS/CSS hashed: cache-first).
// ─────────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Limpa TODOS os caches da origem
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));

    // 2. Auto-unregistra
    await self.registration.unregister();

    // 3. Forca reload de todas as abas abertas (sem SW agora)
    const allClients = await self.clients.matchAll({ type: 'window' });
    for (const client of allClients) {
      // navigate() carrega a mesma URL sem SW interceptando
      client.navigate(client.url).catch(() => {/* ok se nao puder */});
    }
  })());
});

// Nao intercepta fetch — passa direto pra rede.
// (Sem listener 'fetch' = browser usa fetch padrao.)

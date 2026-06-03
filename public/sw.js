// ─────────────────────────────────────────────────────────────────────
// Service Worker — cache offline ciente de versao.
//
// Substitui o antigo kill-switch. Objetivo: deixar o app ABRIR offline (login
// offline + rota offline) SEM repetir o bug historico de "bundle antigo apos
// deploy".
//
// A logica aqui ESPELHA src/lib/offline/swCache.ts (que tem os testes). Se
// mudar a estrategia, mude la primeiro.
//
// Versao por deploy: lida do ?v=<sha> da URL de registro
// (PWAInstallPrompt registra /sw.js?v=NEXT_PUBLIC_BUILD_SHA). Quando o SHA muda,
// a URL muda → o browser instala um SW novo → o activate purga os caches da
// versao anterior.
//
// Estrategia:
// - navegacao/HTML  → REDE-PRIMEIRO sem timeout (online = sempre fresco; cache
//                     so quando o fetch REALMENTE falha = offline de verdade).
// - /_next/static, /icons, /leaflet.css, /manifest → CACHE-FIRST (imutaveis, hash).
// - /api/* e cross-origin → passthrough (rede). Offline de dados = IndexedDB.
// ─────────────────────────────────────────────────────────────────────

const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE_SHELL = `frota-shell-${VERSION}`;
const CACHE_STATIC = `frota-static-${VERSION}`;

// Telas pre-cacheadas no install (espelha shellsParaPrecache() em swCache.ts).
// Garante que o app ABRE offline ja na primeira vez depois de instalado, sem
// depender de o motorista ter visitado cada URL antes.
const PRECACHE_SHELLS = ['/motorista', '/mobile/rota', '/login'];

self.addEventListener('install', (event) => {
  // Ativa imediatamente — a estrategia rede-primeiro garante frescor online.
  self.skipWaiting();
  // Pre-cacheia as telas-chave (best-effort: se uma falhar, nao aborta o install).
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    await Promise.all(
      PRECACHE_SHELLS.map(async (url) => {
        try {
          const res = await fetch(url, { credentials: 'same-origin' });
          if (res && res.ok) await cache.put(url, res.clone());
        } catch (_e) {
          // offline durante o install (raro) — segue sem essa shell.
        }
      })
    );
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purga caches de versoes antigas (nao mexe em caches de terceiros).
    const nomes = await caches.keys();
    await Promise.all(
      nomes
        .filter((n) => n.startsWith('frota-') && !n.endsWith(`-${VERSION}`))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// classificarRequisicao — espelha src/lib/offline/swCache.ts
function classificar(url, method, mode) {
  if (method !== 'GET') return 'passthrough';
  if (url.origin !== self.location.origin) return 'passthrough';
  if (url.pathname.startsWith('/api/')) return 'passthrough';
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/tesseract/') || // motor + dicionario OCR (offline)
    url.pathname === '/leaflet.css' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    return 'static';
  }
  if (mode === 'navigate') return 'navigate';
  return 'passthrough';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const estrategia = classificar(url, req.method, req.mode);

  if (estrategia === 'static') {
    event.respondWith(cacheFirst(req));
  } else if (estrategia === 'navigate') {
    event.respondWith(networkFirstNav(req));
  }
  // 'passthrough' → nao chama respondWith; browser usa fetch padrao.
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirstNav(req) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    // SEM timeout: online sempre espera o HTML fresco (nunca serve cache por lentidao).
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Offline REAL (fetch rejeitou) — serve o cache desta navegacao, ou um shell
    // pre-cacheado (qualquer rota interna abre num shell util em vez do erro).
    let hit =
      (await cache.match(req)) ||
      (await cache.match(new URL(req.url).pathname));
    if (!hit) {
      for (const shell of PRECACHE_SHELLS) {
        hit = await cache.match(shell);
        if (hit) break;
      }
    }
    if (hit) return hit;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Offline</title><body style="font-family:system-ui;background:#0f172a;color:#f1f5f9;' +
        'display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:2rem">' +
        '<div><h1>📴 Sem conexão</h1><p>Esta tela ainda não foi aberta online neste aparelho.</p>' +
        '<p>Conecte-se uma vez para usá-la offline depois.</p></div></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    );
  }
}

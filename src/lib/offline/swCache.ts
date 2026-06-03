/**
 * Regras de cache do Service Worker — LOGICA PURA e testavel.
 *
 * O arquivo `public/sw.js` (que roda no contexto do SW, fora do bundle) ESPELHA
 * exatamente estas regras. Mantenha os dois em sincronia: aqui estao os testes,
 * la esta o runtime. Qualquer mudanca de estrategia comeca por aqui.
 *
 * Estrategia (resolve o bug historico de "bundle antigo apos deploy"):
 * - HTML/navegacao → REDE-PRIMEIRO sem timeout. Online sempre pega o fresco;
 *   o cache so e servido quando o fetch REALMENTE falha (offline de verdade),
 *   nunca por lentidao/sinal fraco.
 * - Assets com hash (/_next/static, icones, leaflet.css, manifest) → CACHE-FIRST.
 *   Sao imutaveis (nome com hash); cada deploy gera nomes novos.
 * - APIs internas (/api/*) e cross-origin (tiles do mapa) → PASSTHROUGH (rede).
 *   O offline de dados e resolvido pelo IndexedDB (Dexie), nao pelo SW.
 * - Caches sao versionados por deploy (NEXT_PUBLIC_BUILD_SHA); o activate purga
 *   os de versoes diferentes.
 */

export type EstrategiaSW = 'static' | 'navigate' | 'passthrough';

export interface RequisicaoSW {
  origin: string;
  selfOrigin: string;
  pathname: string;
  method: string;
  mode: string; // 'navigate' | 'cors' | 'no-cors' | ...
}

/** Decide como o SW deve tratar uma requisicao. PURA. */
export function classificarRequisicao(req: RequisicaoSW): EstrategiaSW {
  if (req.method !== 'GET') return 'passthrough';
  if (req.origin !== req.selfOrigin) return 'passthrough'; // cross-origin (ex.: tiles OSM)
  if (req.pathname.startsWith('/api/')) return 'passthrough'; // APIs → rede; Dexie cuida do offline

  if (
    req.pathname.startsWith('/_next/static/') ||
    req.pathname.startsWith('/icons/') ||
    req.pathname === '/leaflet.css' ||
    req.pathname === '/manifest.webmanifest'
  ) {
    return 'static';
  }

  if (req.mode === 'navigate') return 'navigate';
  return 'passthrough';
}

/**
 * Telas que o SW PRE-CACHEIA no install (enquanto online), pra o app abrir
 * offline ja na PRIMEIRA vez depois de instalado — sem depender de o motorista
 * ter visitado cada URL antes. Sao tambem o fallback de navegacao offline.
 *
 * '/motorista' = home (start_url do PWA); '/mobile/rota' = tela da rota;
 * '/login' = pra cair numa tela util se a sessao offline expirar.
 */
export function shellsParaPrecache(): string[] {
  return ['/motorista', '/mobile/rota', '/login'];
}

export function nomeCacheShell(versao: string): string {
  return `frota-shell-${versao}`;
}

export function nomeCacheStatic(versao: string): string {
  return `frota-static-${versao}`;
}

/**
 * True se um cache existente deve ser PURGADO no activate (e de uma versao
 * antiga). Nunca mexe em caches de terceiros (que nao comecam com 'frota-').
 */
export function deveLimparCache(nome: string, versaoAtual: string): boolean {
  if (!nome.startsWith('frota-')) return false;
  return !nome.endsWith(`-${versaoAtual}`);
}

/**
 * Cliente Nominatim — converte endereco em texto -> coordenadas geograficas.
 *
 * Nominatim e o servico de geocoding publico do OpenStreetMap. Limite oficial:
 * 1 req/segundo. Para o nosso caso (motorista capturando NFs a cada ~10s),
 * isso e mais que suficiente, mas implementamos rate limiter por seguranca.
 *
 * SERVER-ONLY: respeita User-Agent (Nominatim bloqueia anonimos). A API route
 * /api/routing/geocodar (passo 1.6) expoe ao browser.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.5 + 0.5 (tipos).
 */

import { createLogger } from '@/lib/logger';
import type { ResultadoGeocoding } from './types';

const log = createLogger('nominatim');

const NOMINATIM_URL_BASE = (
  process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'
).replace(/\/$/, '');
const TIMEOUT_MS = 5000;
const MIN_INTERVAL_MS = 1100; // 1 req/s + margem

// Estado de rate limiting (module-level, processo unico)
let _lastRequestAt = 0;

// ─── TIPOS ──────────────────────────────────────────────────────────

export type ResultadoGeocodar =
  | { ok: true; resultado: ResultadoGeocoding }
  | {
      ok: false;
      motivo: 'endereco_invalido' | 'nao_encontrado' | 'erro_rede' | 'timeout';
    };

export type ResultadoGeocodarMultiplos =
  | { ok: true; resultados: ResultadoGeocoding[] }
  | {
      ok: false;
      motivo: 'endereco_invalido' | 'nao_encontrado' | 'erro_rede' | 'timeout';
    };

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  /** Presente quando passamos addressdetails=1 — campos estruturados. */
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
    state_code?: string;
    postcode?: string;
  };
}

// ─── HELPERS PUBLICOS ───────────────────────────────────────────────

/**
 * Monta string de busca pro Nominatim a partir de partes do endereco.
 * Filtra partes vazias e adiciona 'Brasil' ao final pra melhor precisao.
 */
export function formatarEnderecoParaGeocoding(parts: {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}): string {
  const partes = [
    parts.logradouro,
    parts.numero,
    parts.bairro,
    parts.cidade,
    parts.uf,
    parts.cep,
    'Brasil',
  ].filter((p): p is string => Boolean(p && p.trim()));
  return partes.join(', ');
}

/** Reset do rate limiter — uso EXCLUSIVO de testes. */
export function _resetRateLimit(): void {
  _lastRequestAt = 0;
}

// ─── HELPERS PÚBLICOS ───────────────────────────────────────────────

/**
 * Calcula distância em km entre dois pontos (fórmula Haversine simples).
 * Precisão suficiente para ordenar resultados — não use para navegação.
 */
export function calcularDistanciaKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── INTERNO ────────────────────────────────────────────────────────

async function respeitarRateLimit(): Promise<void> {
  const agora = Date.now();
  const desdeUltima = agora - _lastRequestAt;
  if (desdeUltima < MIN_INTERVAL_MS) {
    const espera = MIN_INTERVAL_MS - desdeUltima;
    await new Promise((r) => setTimeout(r, espera));
  }
  _lastRequestAt = Date.now();
}

// ─── FUNCAO PRINCIPAL ───────────────────────────────────────────────

/**
 * Converte endereço em texto -> { lat, lng, endereco_normalizado }.
 * Sempre devolve resultado tipado — nunca lança exceção.
 */
export async function geocodar(endereco: string): Promise<ResultadoGeocodar> {
  if (!endereco || endereco.trim().length < 3) {
    return { ok: false, motivo: 'endereco_invalido' };
  }

  await respeitarRateLimit();

  const url = new URL(`${NOMINATIM_URL_BASE}/search`);
  url.searchParams.set('q', endereco);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim exige UA distintivo — bloqueia clients anonimos.
        'User-Agent': 'SistemaDeFrota/1.0 (routing-mvp)',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('nominatim_http_error', { status: res.status, endereco });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as NominatimItem[];

    if (!Array.isArray(data) || data.length === 0) {
      log.info('endereco_nao_encontrado', { endereco });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    const item = data[0];
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      log.warn('lat_lng_invalido_no_payload', { item });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    log.info('endereco_geocodado', { endereco, lat, lng });
    return {
      ok: true,
      resultado: {
        lat,
        lng,
        endereco_normalizado: item.display_name,
      },
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('nominatim_timeout', { endereco, timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('nominatim_network_error', { endereco, error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocoda com fallback progressivo — tenta até 4 variações removendo CEP/bairro/numero.
 *
 * Nominatim publico falha com frequencia em enderecos BR quando a query inclui
 * todas as partes (CEP errado/inexistente no OSM, bairro com nome divergente, etc).
 * Remover CEP e/ou bairro costuma resolver. Mesma estrategia usada pelo otimizar.
 *
 * Ordem das tentativas:
 *   1. logradouro + numero + bairro + cidade + uf + cep (mais especifico)
 *   2. logradouro + numero + cidade + uf (sem CEP nem bairro)
 *   3. logradouro + numero + cidade + uf + cep (sem bairro, com CEP)
 *   4. logradouro + cidade + uf (sem numero, sem CEP, sem bairro)
 *
 * Duplicatas (ex: se bairro/cep vazios, tentativa 1==2) sao deduplicadas.
 * Devolve resultado tipado — nunca lanca.
 */
export async function geocodarComFallback(parts: {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}): Promise<ResultadoGeocodar & { tentativa?: number }> {
  const tentativas = [
    formatarEnderecoParaGeocoding(parts),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      numero: parts.numero,
      cidade: parts.cidade,
      uf: parts.uf,
    }),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      numero: parts.numero,
      cidade: parts.cidade,
      uf: parts.uf,
      cep: parts.cep,
    }),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      cidade: parts.cidade,
      uf: parts.uf,
    }),
  ];

  const tentativasUnicas = [...new Set(tentativas)];
  let ultimoErro: ResultadoGeocodar = { ok: false, motivo: 'nao_encontrado' };

  for (let i = 0; i < tentativasUnicas.length; i++) {
    const r = await geocodar(tentativasUnicas[i]);
    if (r.ok) {
      if (i > 0) {
        log.info('geocoding_fallback_ok', { tentativa: i + 1, query: tentativasUnicas[i] });
      }
      return { ...r, tentativa: i + 1 };
    }
    ultimoErro = r;
    // Se erro foi de rede/timeout/invalido nao adianta tentar variacoes
    if (r.motivo === 'erro_rede' || r.motivo === 'timeout' || r.motivo === 'endereco_invalido') {
      return r;
    }
  }

  log.warn('geocoding_falhou_todas_tentativas', { tentativas: tentativasUnicas.length });
  return ultimoErro;
}

/**
 * Busca até `limite` resultados para um endereço.
 * Se `lat`/`lng` forem fornecidos, ordena os resultados por distância ao ponto.
 * Sempre devolve resultado tipado — nunca lança exceção.
 */
export async function geocodarMultiplos(
  endereco: string,
  limite = 5,
  userLat?: number,
  userLng?: number,
): Promise<ResultadoGeocodarMultiplos> {
  if (!endereco || endereco.trim().length < 3) {
    return { ok: false, motivo: 'endereco_invalido' };
  }

  await respeitarRateLimit();

  const url = new URL(`${NOMINATIM_URL_BASE}/search`);
  url.searchParams.set('q', endereco);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(Math.min(limite, 10)));
  url.searchParams.set('countrycodes', 'br');
  // addressdetails=1: Nominatim devolve campos estruturados (rua, bairro,
  // cidade, uf) em vez de so o display_name como string. Frontend usa pra
  // mostrar pro motorista escolher entre "Rua X em Bairro A" vs "Rua X
  // em Bairro B" com clareza.
  url.searchParams.set('addressdetails', '1');

  // Viewbox: enviesa busca pra raio ~50km ao redor do motorista quando
  // disponivel. Nominatim ainda devolve resultados fora da box, mas prioriza
  // os de dentro — alinha com expectativa do motorista de ver primeiro o que
  // esta perto.
  if (userLat !== undefined && userLng !== undefined) {
    const delta = 0.5; // ~50km de lado
    const viewbox = [
      userLng - delta,
      userLat + delta,
      userLng + delta,
      userLat - delta,
    ].join(',');
    url.searchParams.set('viewbox', viewbox);
    url.searchParams.set('bounded', '0'); // permite resultados fora da box (com prioridade menor)
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'SistemaDeFrota/1.0 (routing-mvp)' },
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('nominatim_multiplos_http_error', { status: res.status, endereco });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as NominatimItem[];

    if (!Array.isArray(data) || data.length === 0) {
      log.info('endereco_multiplos_nao_encontrado', { endereco });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    // Converte, filtra invalidos
    const resultados: ResultadoGeocoding[] = data
      .map((item) => {
        const a = item.address ?? {};
        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          endereco_normalizado: item.display_name,
          logradouro: a.road ?? a.pedestrian ?? undefined,
          numero: a.house_number ?? undefined,
          // OSM em metropoles BR (BH, Contagem, RJ, SP) mapeia:
          //   suburb = REGIAO administrativa (ex: "Nacional", "Eldorado")
          //   neighbourhood = BAIRRO real (ex: "São Mateus", "Cidade Industrial")
          // Em cidades menores so vem suburb. Por isso: preferir neighbourhood
          // (mais especifico quando os dois existem); cair pra suburb senao.
          bairro: a.neighbourhood ?? a.suburb ?? a.city_district ?? undefined,
          cidade: a.city ?? a.town ?? a.municipality ?? undefined,
          uf: a.state_code?.toUpperCase() ?? a.state ?? undefined,
          cep: a.postcode?.replace(/\D/g, '') ?? undefined,
        };
      })
      .filter((r) => !Number.isNaN(r.lat) && !Number.isNaN(r.lng));

    // Ordena por distancia ao usuario quando disponivel
    if (userLat !== undefined && userLng !== undefined) {
      resultados.sort(
        (a, b) =>
          calcularDistanciaKm(userLat, userLng, a.lat, a.lng) -
          calcularDistanciaKm(userLat, userLng, b.lat, b.lng)
      );
    }

    log.info('endereco_multiplos_geocodado', { endereco, total: resultados.length });
    return { ok: true, resultados };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('nominatim_multiplos_timeout', { endereco, timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('nominatim_multiplos_network_error', { endereco, error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

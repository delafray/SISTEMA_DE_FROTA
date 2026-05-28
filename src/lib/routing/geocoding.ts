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

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
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
 * Converte endereco em texto -> { lat, lng, endereco_normalizado }.
 * Sempre devolve resultado tipado — nunca lanca excecao.
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

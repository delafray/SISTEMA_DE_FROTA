/**
 * Cliente da Google Geocoding API.
 *
 * Resolve endereco (texto livre — otimo pra voz, corrige digitacao) em:
 *   - coordenada lat/lng + nivel de precisao (ROOFTOP = porta exata)
 *   - CEP (postal_code), logradouro, numero, bairro, cidade, UF
 *   - endereco formatado
 *
 * SERVER-ONLY: usa GOOGLE_MAPS_API_KEY. NUNCA chamar do browser (vazaria a
 * chave). O orquestrador (geocodeCache + fluxo) decide QUANDO chamar — aqui so
 * faz a chamada e parseia. Sem chave → { ok:false, motivo:'sem_chave' } (o
 * sistema cai no fluxo gratis). Nunca lanca excecao.
 *
 * Decidido com o dono em 2026-06-01: Google como geocoder principal da captura,
 * atras de cache + cota mensal; fallback ViaCEP+escolher.
 */

import { createLogger } from '@/lib/logger';
import { siglaUF } from './geocoding';

const log = createLogger('google_geocoding');

const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 6000;

export interface ResultadoGoogle {
  lat: number;
  lng: number;
  cep?: string;             // 8 digitos sem hifen
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  precisao?: string;        // location_type: ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE
  endereco_formatado: string;
  partial_match?: boolean;
}

export type RetornoGoogle =
  | { ok: true; resultados: ResultadoGoogle[] }
  | {
      ok: false;
      motivo:
        | 'sem_chave'
        | 'zero_resultados'
        | 'over_limit'
        | 'negado'
        | 'requisicao_invalida'
        | 'erro_rede'
        | 'timeout';
    };

interface GoogleComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleResult {
  formatted_address: string;
  address_components: GoogleComponent[];
  geometry: { location: { lat: number; lng: number }; location_type?: string };
  partial_match?: boolean;
}

/** Acha o 1o componente que tem `type` na lista de types. */
function comp(components: GoogleComponent[], type: string): GoogleComponent | undefined {
  return components.find((c) => c.types.includes(type));
}

function parseResult(r: GoogleResult): ResultadoGoogle {
  const ac = r.address_components ?? [];
  const cepRaw = comp(ac, 'postal_code')?.long_name;
  const cep = cepRaw ? cepRaw.replace(/\D/g, '') : undefined;
  // UF: admin_area_level_1 short_name ja vem como sigla ("MG"); fallback no nome.
  const uf1 = comp(ac, 'administrative_area_level_1');
  const uf = uf1
    ? (/^[A-Za-z]{2}$/.test(uf1.short_name) ? uf1.short_name.toUpperCase() : siglaUF(uf1.long_name))
    : undefined;
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    cep: cep && /^\d{8}$/.test(cep) ? cep : undefined,
    logradouro: comp(ac, 'route')?.long_name,
    numero: comp(ac, 'street_number')?.long_name,
    // bairro no BR: sublocality_level_1 (mais comum) ou neighborhood.
    bairro:
      comp(ac, 'sublocality_level_1')?.long_name ??
      comp(ac, 'sublocality')?.long_name ??
      comp(ac, 'neighborhood')?.long_name,
    // cidade: administrative_area_level_2 (municipio no BR) ou locality.
    cidade:
      comp(ac, 'administrative_area_level_2')?.long_name ??
      comp(ac, 'locality')?.long_name,
    uf,
    precisao: r.geometry.location_type,
    endereco_formatado: r.formatted_address,
    partial_match: r.partial_match === true,
  };
}

/**
 * Geocoda `query` (texto livre) via Google. `bias` enviesa por proximidade
 * (lat/lng do motorista) sem restringir. Sempre devolve resultado tipado.
 */
export async function geocodarGoogle(
  query: string,
  bias?: { lat?: number; lng?: number },
): Promise<RetornoGoogle> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, motivo: 'sem_chave' };
  if (!query || query.trim().length < 3) return { ok: false, motivo: 'requisicao_invalida' };

  const url = new URL(GOOGLE_URL);
  url.searchParams.set('address', query);
  url.searchParams.set('key', key);
  url.searchParams.set('region', 'br');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('components', 'country:BR');
  if (bias && bias.lat !== undefined && bias.lng !== undefined) {
    // Bias suave por proximidade (nao restringe resultados).
    url.searchParams.set('location', `${bias.lat},${bias.lng}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      log.warn('google_http_error', { status: res.status });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as { status: string; results?: GoogleResult[] };

    switch (data.status) {
      case 'OK':
        return { ok: true, resultados: (data.results ?? []).map(parseResult) };
      case 'ZERO_RESULTS':
        return { ok: false, motivo: 'zero_resultados' };
      case 'OVER_QUERY_LIMIT':
      case 'OVER_DAILY_LIMIT':
        log.warn('google_over_limit', { status: data.status });
        return { ok: false, motivo: 'over_limit' };
      case 'REQUEST_DENIED':
        log.error('google_request_denied');
        return { ok: false, motivo: 'negado' };
      default:
        log.warn('google_status_inesperado', { status: data.status });
        return { ok: false, motivo: 'requisicao_invalida' };
    }
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('google_timeout', { timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('google_network_error', { error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

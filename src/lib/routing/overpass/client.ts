/**
 * Cliente Overpass API self-hosted.
 *
 * Faz query bbox + addr:street, devolve numeros mapeados na rua dentro daquele
 * raio geografico. NAO depende de areas pre-geradas (pra evitar setup extra).
 *
 * Timeout de 10s no client conforme recomendacao de producao (agente 3 da
 * pesquisa) — query travada come slot e RAM no servidor.
 */

import { createLogger } from '@/lib/logger';
import { regexOverpassRua } from './normalizar';

const log = createLogger('overpass-client');

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'http://129.80.27.159:12345/api/interpreter';
const TIMEOUT_MS = 10_000;
const BBOX_DELTA = 0.05; // ~5km de raio ao redor do ponto do CEP

export interface ConsultaResultado {
  ok: true;
  enderecos: Array<{
    numero: number;
    lat: number;
    lng: number;
  }>;
}

export interface ConsultaErro {
  ok: false;
  motivo: 'sem_coords' | 'rua_invalida' | 'erro_rede' | 'timeout' | 'http_error' | 'parse_error';
  detalhe?: string;
}

export type Consulta = ConsultaResultado | ConsultaErro;

/**
 * Consulta enderecos de uma rua especifica dentro de um bbox ao redor do CEP.
 *
 * @param lat coords do CEP (vem do Nominatim, geralmente cep_cache)
 * @param lng coords do CEP
 * @param logradouro nome bruto da rua (sera normalizado/regex)
 */
export async function consultarEnderecos(
  lat: number,
  lng: number,
  logradouro: string
): Promise<Consulta> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, motivo: 'sem_coords' };
  }

  const ruaRegex = regexOverpassRua(logradouro);
  if (!ruaRegex || ruaRegex.length < 3) {
    return { ok: false, motivo: 'rua_invalida' };
  }

  // bbox = (sul, oeste, norte, leste) — formato Overpass
  const sul = lat - BBOX_DELTA;
  const norte = lat + BBOX_DELTA;
  const oeste = lng - BBOX_DELTA;
  const leste = lng + BBOX_DELTA;

  // CSV pra resposta ~10x menor. `nwr` cobre node + way + relation.
  const ql = `[out:csv("addr:housenumber",::lat,::lon;false;",")][timeout:8];` +
    `(nwr["addr:street"~"${ruaRegex}",i]["addr:housenumber"](${sul},${oeste},${norte},${leste}););` +
    `out center;`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const inicio = Date.now();
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: ql }).toString(),
      signal: controller.signal,
    });
    const duracao = Date.now() - inicio;

    if (!res.ok) {
      log.warn('overpass_http_error', { status: res.status, duracao });
      return { ok: false, motivo: 'http_error', detalhe: `HTTP ${res.status}` };
    }

    const csv = await res.text();
    const enderecos = parsearCsv(csv);
    log.info('overpass_ok', { rua: ruaRegex, encontrados: enderecos.length, duracao_ms: duracao });
    return { ok: true, enderecos };
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      log.warn('overpass_timeout', { rua: ruaRegex });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('overpass_erro_rede', { rua: ruaRegex, message: e.message });
    return { ok: false, motivo: 'erro_rede', detalhe: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Parseia CSV do Overpass: "numero,lat,lng\n..." (sem header pq false em out:csv). */
function parsearCsv(csv: string): Array<{ numero: number; lat: number; lng: number }> {
  const linhas = csv.trim().split('\n').filter((l) => l.trim());
  const resultados: Array<{ numero: number; lat: number; lng: number }> = [];

  for (const linha of linhas) {
    const partes = linha.split(',');
    if (partes.length !== 3) continue;

    // housenumber pode ser "104", "104A", "1234-1236" etc.
    // Pra range/min/max, extrai apenas o PRIMEIRO numero puro.
    const matchNum = partes[0].match(/\d+/);
    if (!matchNum) continue;
    const numero = parseInt(matchNum[0], 10);
    if (Number.isNaN(numero)) continue;

    const lat = parseFloat(partes[1]);
    const lng = parseFloat(partes[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    resultados.push({ numero, lat, lng });
  }

  return resultados;
}

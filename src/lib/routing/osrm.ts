/**
 * Cliente OSRM — calcula rota entre 2+ coordenadas.
 *
 * OSRM e o motor de roteamento auto-hospedado (Oracle VM, Brasil-wide).
 * Endpoint usado: GET /route/v1/driving/{lng1,lat1};{lng2,lat2};...
 * Documentacao: https://project-osrm.org/docs/v5.24.0/api/#route-service
 *
 * SERVER-ONLY: usa OSRM_URL do env (apontando pra VM Oracle).
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.7.
 */

import { createLogger } from '@/lib/logger';
import type { Coordenada, ResultadoOSRM } from './types';

const log = createLogger('osrm');

const TIMEOUT_MS = 15000; // OSRM pode demorar em rotas longas

// ─── TIPOS ──────────────────────────────────────────────────────────

export type ResultadoCalcularRota =
  | { ok: true; rota: ResultadoOSRM }
  | { ok: false; motivo: 'config_faltando' | 'sem_rota' | 'erro_rede' | 'timeout' };

interface OSRMRouteResponse {
  code: string;
  routes?: Array<{
    distance: number;  // metros
    duration: number;  // segundos
    geometry?: string; // polyline encoded (se overview != 'false')
  }>;
}

// ─── HELPERS ────────────────────────────────────────────────────────

function getBaseUrl(): string | null {
  const url = process.env.OSRM_URL;
  if (!url) return null;
  return url.replace(/\/$/, '');
}

/** Monta o segmento de coordenadas pro path do OSRM: "lng,lat;lng,lat". */
function montarCoords(pontos: Coordenada[]): string {
  return pontos.map((p) => `${p.lng},${p.lat}`).join(';');
}

// ─── FUNCAO PRINCIPAL ───────────────────────────────────────────────

/**
 * Calcula rota entre 2+ pontos (na ordem dada — nao otimiza).
 * Devolve distancia, tempo e polyline pra desenhar no Leaflet.
 */
export async function calcularRota(pontos: Coordenada[]): Promise<ResultadoCalcularRota> {
  if (pontos.length < 2) {
    return { ok: false, motivo: 'sem_rota' };
  }

  const base = getBaseUrl();
  if (!base) {
    log.warn('osrm_url_nao_configurada');
    return { ok: false, motivo: 'config_faltando' };
  }

  const coords = montarCoords(pontos);
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=polyline`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      log.warn('osrm_http_error', { status: res.status });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as OSRMRouteResponse;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      log.info('osrm_sem_rota', { code: data.code });
      return { ok: false, motivo: 'sem_rota' };
    }

    const r = data.routes[0];
    return {
      ok: true,
      rota: {
        distanciaKm: r.distance / 1000,
        tempoMin: r.duration / 60,
        polyline: r.geometry,
      },
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('osrm_timeout', { timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('osrm_network_error', { error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Helper conveniente pra rota ponto-a-ponto (uso: integracao com Frete
 * pra preencher km_estimado).
 */
export async function calcularRotaSimples(
  origem: Coordenada,
  destino: Coordenada
): Promise<ResultadoCalcularRota> {
  return calcularRota([origem, destino]);
}

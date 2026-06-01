/**
 * Resolve a melhor coordenada pra um endereco, em ordem de prioridade, e diz
 * o quao confiavel ela e. Centraliza a decisao usada na otimizacao e ao
 * adicionar parada.
 *
 * Prioridade:
 *  1. Coordenada APRENDIDA pela frota (visita anterior, GPS real) → 'alta'
 *  2. GOOGLE rooftop/interpolated (porta exata, atras de cache+cota) → 'alta'
 *  3. Overpass CONFIRMADO (numero exato mapeado no OSM)            → 'alta'
 *  4. Nominatim com fallback progressivo (centro da rua)          → 'baixa'
 *
 * A confianca propaga pro snapshot da parada e a tela do motorista usa pra
 * decidir entre navegar por coordenada (alta) ou por endereco em texto (baixa,
 * deixa o Waze/Google achar o numero). Ver deepLinks.ts.
 *
 * Nunca lanca — devolve null so quando nem o Nominatim acha a rua.
 */

import { createLogger } from '@/lib/logger';
import { geocodarComFallback } from './geocoding';
import { lerCoordAprendida } from './coordsAprendidas';
import { resolverGoogleCacheado, montarQueryEstruturada } from './geocodeCache';
import { validarNumero } from './overpass/validar';
import type { CoordFonte } from './types';

const log = createLogger('resolver-coordenada');

export interface ParamsResolver {
  empresa_id: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface CoordResolvida {
  lat: number;
  lng: number;
  confianca: 'alta' | 'baixa';
  fonte: CoordFonte;
}

/** Precisões do Google que confiamos como pino exato (porta/quadra). */
const PRECISAO_ALTA_GOOGLE = new Set(['ROOFTOP', 'RANGE_INTERPOLATED']);

export async function resolverCoordenada(
  p: ParamsResolver
): Promise<CoordResolvida | null> {
  // 1. Coordenada aprendida pela frota — a fonte mais precisa que existe pra
  //    nossa regiao. Curto-circuita tudo.
  const aprendida = await lerCoordAprendida(p.empresa_id, {
    logradouro: p.logradouro,
    numero: p.numero,
    cidade: p.cidade,
    uf: p.uf,
  });
  if (aprendida) {
    log.info('coord_aprendida_hit', { logradouro: p.logradouro, numero: p.numero });
    return { lat: aprendida.lat, lng: aprendida.lng, confianca: 'alta', fonte: 'aprendida' };
  }

  // 2. Google (atras de cache + cota): quando devolve ROOFTOP/RANGE_INTERPOLATED
  //    a coord e na porta/quadra — confianca alta, curto-circuita. Cache hit nao
  //    gera custo; sem chave/sem cota → null e segue pro Nominatim.
  if (p.logradouro && p.cidade) {
    const g = await resolverGoogleCacheado(montarQueryEstruturada(p));
    if (g && g.resultado.precisao && PRECISAO_ALTA_GOOGLE.has(g.resultado.precisao)) {
      log.info('coord_google_hit', { precisao: g.resultado.precisao, fonte: g.fonte });
      // Distingue cache (verde) de chamada de API (laranja) no selo do mapa.
      const fonte: CoordFonte = g.fonte === 'cache' ? 'google_cache' : 'google_api';
      return { lat: g.resultado.lat, lng: g.resultado.lng, confianca: 'alta', fonte };
    }
  }

  // 3. Nominatim (fallback progressivo) — coord base, necessaria tambem pro
  //    bbox do Overpass. Se nem isso acha a rua, desistimos.
  const geo = await geocodarComFallback({
    logradouro: p.logradouro,
    numero: p.numero,
    bairro: p.bairro,
    cidade: p.cidade ?? '',
    uf: p.uf ?? '',
    cep: p.cep,
  });
  if (!geo.ok) {
    return null;
  }
  let melhor: CoordResolvida = {
    lat: geo.resultado.lat,
    lng: geo.resultado.lng,
    confianca: 'baixa',
    fonte: 'nominatim',
  };

  // 4. Overpass: se o numero exato estiver mapeado no OSM, a coord dele e
  //    precisa — sobrescreve o centro da rua do Nominatim. Best-effort: a
  //    validacao "nunca bloqueia" e qualquer falha mantem o Nominatim.
  if (p.numero && p.logradouro && p.cidade && p.uf) {
    try {
      const val = await validarNumero({
        numero: p.numero,
        logradouro: p.logradouro,
        cidade: p.cidade,
        uf: p.uf,
        lat: geo.resultado.lat,
        lng: geo.resultado.lng,
      });
      if (val.status === 'confirmado' && val.coordenada) {
        melhor = {
          lat: val.coordenada.lat,
          lng: val.coordenada.lng,
          confianca: 'alta',
          fonte: 'overpass',
        };
      }
    } catch (err) {
      log.warn('overpass_refino_falhou', { message: (err as Error).message });
    }
  }

  return melhor;
}

/**
 * Estimativa dinâmica de distância/tempo da rota em andamento — função PURA,
 * extraída de mobile/rota/page.tsx sem mudança de comportamento.
 *
 * A partir da posição atual do motorista e das paradas pendentes (ordenadas),
 * estima km/min até a próxima parada e até o fim da rota. Linha reta × fator
 * 1.35 pra aproximar ruas reais; ~20 km/h de média urbana (3 min/km).
 */

import { calcularDistanciaKm } from '@/lib/routing/geocoding';
import type { Parada } from '@/lib/routing/types';

export type StatsDinamicos = {
  proxKm: number;
  proxMin: number;
  faltamKm: number;
  faltamMin: number;
};

const FATOR_RUAS = 1.35; // Fator para estimar ruas reais a partir de linha reta
const MIN_POR_KM = 3;    // ~20km/h media urbana

export function calcularStatsRota(
  posicaoAtual: { lat: number; lng: number } | null,
  paradas: Parada[]
): StatsDinamicos | null {
  if (!posicaoAtual || paradas.length === 0) return null;
  const pendentes = paradas.filter((p) => !p.concluida_em).sort((a, b) => a.ordem - b.ordem);
  if (pendentes.length === 0) return null; // tudo entregue

  const proxima = pendentes[0];
  const distProxima = calcularDistanciaKm(posicaoAtual.lat, posicaoAtual.lng, proxima.latitude, proxima.longitude) * FATOR_RUAS;

  let distFaltam = distProxima;
  for (let i = 0; i < pendentes.length - 1; i++) {
    distFaltam += calcularDistanciaKm(
      pendentes[i].latitude, pendentes[i].longitude,
      pendentes[i + 1].latitude, pendentes[i + 1].longitude
    ) * FATOR_RUAS;
  }

  return {
    proxKm: distProxima,
    proxMin: Math.round(distProxima * MIN_POR_KM),
    faltamKm: distFaltam,
    faltamMin: Math.round(distFaltam * MIN_POR_KM),
  };
}

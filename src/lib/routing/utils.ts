/**
 * Utilitarios geometricos pra UI de rota.
 */

import type { Coordenada, Parada } from './types';

/**
 * Distancia em KM entre 2 coordenadas (Haversine).
 * Aproximacao boa o suficiente pra mostrar "X.X km" entre paradas.
 * Margem de erro vs distancia rodoviaria: ~20-40% (e linha reta).
 */
export function haversineKm(a: Coordenada, b: Coordenada): number {
  const R = 6371; // raio da Terra em km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Status visual de uma parada — usado pra pinos e cards.
 * - concluida: ja entregue
 * - proxima: primeira pendente (a que o motorista deve ir agora)
 * - fixada: posicao bloqueada pelo motorista
 * - pendente: nao entregue, nao e a proxima
 */
export type StatusParada = 'concluida' | 'proxima' | 'fixada' | 'pendente';

export function statusDaParada(
  parada: Pick<Parada, 'concluida_em' | 'fixada'>,
  idx: number,
  paradas: Pick<Parada, 'concluida_em'>[]
): StatusParada {
  if (parada.concluida_em) return 'concluida';
  // Proxima = primeira parada pendente (na ordem). Fixada nao conta como proxima.
  const proximaIdx = paradas.findIndex((p) => !p.concluida_em);
  if (idx === proximaIdx && !parada.fixada) return 'proxima';
  if (parada.fixada) return 'fixada';
  return 'pendente';
}

/**
 * Cor associada ao status — alinhado com padrao de mercado:
 *   - concluida: verde
 *   - proxima: laranja (destaque visual)
 *   - fixada: vermelho
 *   - pendente: azul
 */
export function corDoStatus(status: StatusParada): string {
  switch (status) {
    case 'concluida':
      return '#16a34a';
    case 'proxima':
      return '#f97316';
    case 'fixada':
      return '#dc2626';
    case 'pendente':
    default:
      return '#2563eb';
  }
}

/**
 * Distancia entre paradas consecutivas (em km, linha reta).
 * Retorna array[N] onde indice 0 e 0 (primeira parada nao tem anterior).
 */
export function distanciasEntreParadas(
  paradas: Pick<Parada, 'latitude' | 'longitude'>[]
): number[] {
  const dists: number[] = [];
  for (let i = 0; i < paradas.length; i++) {
    if (i === 0) {
      dists.push(0);
      continue;
    }
    const a = paradas[i - 1];
    const b = paradas[i];
    dists.push(haversineKm({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude }));
  }
  return dists;
}

/**
 * Soma estimada de KM em linha reta de todo o trajeto.
 * Util pra mostrar "≈ X km" enquanto motorista reordena, sem chamar OSRM.
 */
export function estimarKmTotal(
  paradas: Pick<Parada, 'latitude' | 'longitude'>[]
): number {
  return distanciasEntreParadas(paradas).reduce((a, b) => a + b, 0);
}

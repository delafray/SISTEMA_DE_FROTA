/**
 * Converte uma Parada no alvo de navegação (Waze/Google Maps).
 * A confiança da coordenada (salva no snapshot jsonb) decide se a navegação
 * usa lat/lng (alta) ou o endereço em texto (baixa).
 */

import type { AlvoNavegacao } from '@/lib/routing/deepLinks';
import type { Parada } from '@/lib/routing/types';

export function alvoDe(p: Parada): AlvoNavegacao {
  return {
    lat: p.latitude,
    lng: p.longitude,
    endereco: p.endereco,
    confianca: p.endereco?.coord_confianca,
  };
}

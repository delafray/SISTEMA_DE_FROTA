'use client';

/**
 * MapaRota — mapa Leaflet com pinos numerados nas paradas e traçado da rota.
 *
 * Por que dynamic import com ssr:false:
 * - Leaflet manipula window/document direto (SSR quebra)
 * - react-leaflet exige browser pra renderizar
 *
 * Props:
 * - paradas: Array<Parada com lat/lng e ordem> — desenha pino numerado em cada
 * - polylineEncoded?: string — geometria devolvida pelo OSRM (decoded inline)
 * - altura?: number — altura do container em px (default 360)
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.11.
 */

import dynamic from 'next/dynamic';
import type { Parada } from '@/lib/routing/types';

export interface MapaRotaProps {
  paradas: Array<Pick<Parada, 'ordem' | 'latitude' | 'longitude' | 'endereco' | 'fixada'>>;
  polylineEncoded?: string;
  altura?: number;
}

// Carrega o inner so no client (Leaflet quebra em SSR)
const MapaRotaInner = dynamic(() => import('./MapaRotaInner'), {
  ssr: false,
  loading: () => (
    <div
      data-testid="mapa-loading"
      style={{
        width: '100%',
        background: '#f1f5f9',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}
    >
      Carregando mapa…
    </div>
  ),
});

export function MapaRota(props: MapaRotaProps): React.ReactElement {
  if (!props.paradas || props.paradas.length === 0) {
    return (
      <div
        data-testid="mapa-sem-paradas"
        style={{
          width: '100%',
          padding: 24,
          background: '#f1f5f9',
          borderRadius: 8,
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        Sem paradas pra mostrar no mapa.
      </div>
    );
  }
  return <MapaRotaInner {...props} />;
}

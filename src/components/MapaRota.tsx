'use client';

/**
 * MapaRota — mapa Leaflet com pinos numerados nas paradas e traçado da rota.
 *
 * Pinos seguem padrao de mercado (cor por status):
 *   - azul: pendente
 *   - laranja: proxima a entregar (destaque)
 *   - verde: concluida
 *   - vermelho: fixada
 *
 * Suporta interacao: ao tocar pino, dispara onParadaClick com id.
 * Use `paradaSelecionada` pra destacar visualmente um pino especifico.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.11 + padroes Onfleet/Circuit/Route4Me.
 */

import dynamic from 'next/dynamic';
import type { Parada } from '@/lib/routing/types';

export interface MapaRotaProps {
  paradas: Array<
    Pick<Parada, 'id' | 'ordem' | 'latitude' | 'longitude' | 'endereco' | 'fixada' | 'concluida_em'>
  >;
  polylineEncoded?: string;
  altura?: number;
  paradaSelecionada?: string | null;
  onParadaClick?: (id: string) => void;
  /** Posicao atual do motorista — renderiza pino discreto "you are here". */
  posicaoAtual?: { lat: number; lng: number } | null;
}

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
        minHeight: 200,
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

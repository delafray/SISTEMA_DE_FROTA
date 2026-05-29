'use client';

/**
 * Tijolinho — item visual de uma parada na lista de ajuste de rota.
 *
 * Mesmo componente usado nas 2 abas (modo controla a densidade de info):
 * - modo='ordenar': mostra so numero + nome curto + distancia
 * - modo='detalhes': mostra tudo (endereco completo, horario, observacao)
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.10.
 */

import type { Parada } from '@/lib/routing/types';

export type ModoTijolinho = 'ordenar' | 'detalhes';

export interface TijolinhoProps {
  parada: Pick<Parada, 'id' | 'ordem' | 'endereco' | 'fixada' | 'janela_horario' | 'observacao'>;
  modo: ModoTijolinho;
  onClickDetalhes?: () => void;
  draggableHandle?: React.ReactNode;
  /** Distancia em KM ate a parada anterior (linha reta, Haversine). Modo ordenar. */
  distanciaAnteriorKm?: number;
  /** Destaca visualmente este tijolinho (ex: parada selecionada no mapa). */
  destacado?: boolean;
}

export function Tijolinho({
  parada,
  modo,
  onClickDetalhes,
  draggableHandle,
  distanciaAnteriorKm,
  destacado,
}: TijolinhoProps): React.ReactElement {
  const temJanela = Boolean(parada.janela_horario && parada.janela_horario.length > 0);
  const enderecoCurto = `${parada.endereco.logradouro || '(sem nome)'} — ${parada.endereco.cidade}/${parada.endereco.uf}`;
  const enderecoCompleto = `${parada.endereco.logradouro || '(sem nome)'}, ${parada.endereco.bairro ? parada.endereco.bairro + ', ' : ''}${parada.endereco.cidade}/${parada.endereco.uf}`;

  const numeroBox = (
    <div
      data-testid={`numero-parada-${parada.ordem}`}
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        background: parada.fixada ? '#dc2626' : '#2563eb',
        color: '#fff',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 18,
      }}
    >
      {parada.ordem}
    </div>
  );

  if (modo === 'ordenar') {
    return (
      <div
        data-testid={`tijolinho-ordenar-${parada.ordem}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          background: '#fff',
          border: destacado ? '2px solid #f97316' : '1px solid #e2e8f0',
          borderRadius: 8,
          marginBottom: 8,
          boxShadow: destacado ? '0 0 0 3px rgba(249,115,22,0.2)' : undefined,
        }}
      >
        {numeroBox}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enderecoCurto}</span>
            {temJanela && <span aria-label="tem janela de horario" style={{ flexShrink: 0 }}>⏰</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: '#64748b' }}>
            {typeof distanciaAnteriorKm === 'number' && distanciaAnteriorKm > 0 && (
              <span>📏 {distanciaAnteriorKm.toFixed(1)} km</span>
            )}
            {parada.fixada && <span style={{ color: '#dc2626' }}>🔒 Fixada</span>}
          </div>
        </div>
        {!parada.fixada && draggableHandle}
      </div>
    );
  }

  // modo='detalhes'
  return (
    <div
      data-testid={`tijolinho-detalhes-${parada.ordem}`}
      onClick={onClickDetalhes}
      role={onClickDetalhes ? 'button' : undefined}
      tabIndex={onClickDetalhes ? 0 : undefined}
      style={{
        display: 'flex',
        gap: 12,
        padding: 14,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        marginBottom: 8,
        cursor: onClickDetalhes ? 'pointer' : 'default',
      }}
    >
      {numeroBox}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>📍 {enderecoCompleto}</div>
        {parada.janela_horario && parada.janela_horario.length > 0 && (
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            ⏰ {parada.janela_horario.map((j) => `${j[0]}–${j[1]}`).join(' / ')}
          </div>
        )}
        {parada.observacao && (
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            💬 {parada.observacao}
          </div>
        )}
        {parada.fixada && (
          <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
            🔒 Fixada nesta posicao
          </div>
        )}
      </div>
    </div>
  );
}

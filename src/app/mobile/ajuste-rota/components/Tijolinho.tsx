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

/**
 * Gera uma cor de fundo sutil deterministica a partir do nome do bairro.
 * Mesmo bairro = mesma cor — ajuda motorista a ver visualmente paradas
 * agrupadas por regiao (cluster). Hash simples FNV-1a + paleta pastel.
 */
function corPorBairro(bairro: string | null | undefined): string | undefined {
  if (!bairro || !bairro.trim()) return undefined;
  let h = 2166136261;
  for (let i = 0; i < bairro.length; i++) {
    h ^= bairro.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 50%, 96%)`; // pastel suave
}

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
  const corBairro = corPorBairro(parada.endereco.bairro);
  const numeroCasa = parada.endereco.numero ? `, ${parada.endereco.numero}` : '';
  const enderecoCurto = `${parada.endereco.logradouro || '(sem nome)'}${numeroCasa} — ${parada.endereco.cidade}/${parada.endereco.uf}`;
  const enderecoCompleto = `${parada.endereco.logradouro || '(sem nome)'}${numeroCasa}, ${parada.endereco.bairro ? parada.endereco.bairro + ', ' : ''}${parada.endereco.cidade}/${parada.endereco.uf}`;

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
          gap: 10,
          padding: 10,
          background: corBairro ?? '#fff',
          border: destacado ? '2px solid #f97316' : '1px solid #e2e8f0',
          borderRadius: 8,
          marginBottom: 6,
          boxShadow: destacado ? '0 0 0 3px rgba(249,115,22,0.2)' : undefined,
          // Telefone narrow (320-360px): garante que o tijolinho nao se expande
          // alem do container pai. `minWidth: 0` no flex e essencial.
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {numeroBox}
        {/* min-width:0 + overflow:hidden no container do texto = filho span pode encolher e elipsar */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {/* Linha 1: endereco — agora sem flex (display block) pra que text-overflow funcione direito. ⏰ vai inline. */}
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {enderecoCurto}
            {temJanela && <span aria-label="tem janela de horario" style={{ marginLeft: 6 }}>⏰</span>}
          </div>
          {/* Linha 2: badges com flex-wrap evita overflow horizontal */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 2,
              fontSize: 11,
              color: '#64748b',
              flexWrap: 'wrap',
            }}
          >
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
        gap: 10,
        padding: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        marginBottom: 6,
        cursor: onClickDetalhes ? 'pointer' : 'default',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {numeroBox}
      {/* min-width:0 + overflow:hidden permite quebrar/elipsar texto longo em telefones narrow */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-word' }}>📍 {enderecoCompleto}</div>
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

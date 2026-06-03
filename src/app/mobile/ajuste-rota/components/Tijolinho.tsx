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
import { cores } from '@/lib/mobile/ui';

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
  parada: Pick<Parada, 'id' | 'ordem' | 'endereco' | 'fixada' | 'janela_horario' | 'observacao' | 'concluida_em'>;
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

  const concluida = Boolean(parada.concluida_em);
  const corNumero = concluida
    ? cores.verde // verde — entregue
    : parada.fixada
      ? cores.vermelho // vermelho — fixada
      : cores.azul; // azul — pendente normal

  const numeroBox = (
    <div
      data-testid={`numero-parada-${parada.ordem}`}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        background: corNumero,
        color: cores.branco,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 15,
      }}
    >
      {concluida ? '✓' : parada.ordem}
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
          background: corBairro ?? cores.branco,
          border: destacado ? `2px solid ${cores.laranja}` : `1px solid ${cores.borda}`,
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Endereco quebra em 2-3 linhas se necessario (motorista prefere ler completo a ver "..." cortado) */}
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              lineHeight: 1.3,
              wordBreak: 'break-word',
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
              color: cores.textoFraco,
              flexWrap: 'wrap',
            }}
          >
            {concluida && <span style={{ color: cores.verde, fontWeight: 600 }}>✓ Entregue</span>}
            {typeof distanciaAnteriorKm === 'number' && distanciaAnteriorKm > 0 && (
              <span>📏 {distanciaAnteriorKm.toFixed(1)} km</span>
            )}
            {parada.fixada && <span style={{ color: cores.vermelho }}>🔒 Fixada</span>}
          </div>
        </div>
        {/* Handle so se o tijolinho e arrastavel (nao fixada nem concluida) */}
        {!parada.fixada && !concluida && draggableHandle}
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
        background: cores.branco,
        border: `1px solid ${cores.borda}`,
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
          <div style={{ fontSize: 13, color: cores.textoMedio, marginTop: 4 }}>
            ⏰ {parada.janela_horario.map((j) => `${j[0]}–${j[1]}`).join(' / ')}
          </div>
        )}
        {parada.observacao && (
          <div style={{ fontSize: 13, color: cores.textoMedio, marginTop: 4 }}>
            💬 {parada.observacao}
          </div>
        )}
        {parada.fixada && (
          <div style={{ fontSize: 12, color: cores.vermelho, marginTop: 4, fontWeight: 600 }}>
            🔒 Fixada nesta posicao
          </div>
        )}
      </div>
    </div>
  );
}

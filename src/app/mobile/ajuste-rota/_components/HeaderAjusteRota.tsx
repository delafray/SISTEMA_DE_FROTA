'use client';

/**
 * HeaderAjusteRota — cabecalho da tela de Ajuste de Rota.
 *
 * Contem:
 * - Titulo + botoes de acao (adicionar, inverter, reorganizar)
 * - Contagem de paradas e KM estimado
 * - Faixa de diff KM/tempo quando dirty (ordem mudou)
 */

import type { Parada } from '@/lib/routing/types';
import { cores } from '@/lib/mobile/ui';

export interface HeaderAjusteRotaProps {
  paradas: Parada[];
  dirty: boolean;
  kmExibido: number;
  minExibido: number | null;
  diffKm: number;
  diffMin: number;
  reorganizando: boolean;
  onAdicionar: () => void;
  onInverter: () => void;
  onReorganizar: () => void;
}

export function HeaderAjusteRota({
  paradas,
  dirty,
  kmExibido,
  minExibido,
  diffKm,
  diffMin,
  reorganizando,
  onAdicionar,
  onInverter,
  onReorganizar,
}: HeaderAjusteRotaProps): React.ReactElement {
  const diffSinal = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const diffCor = (n: number) => (n > 0 ? cores.vermelho : n < 0 ? cores.verde : cores.textoFraco);

  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ajuste de Rota</h1>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onAdicionar}
            title="adicionar parada"
            aria-label="adicionar parada"
            data-testid="btn-adicionar-parada"
            style={iconBtnStyle}
          >
            ➕
          </button>
          <button
            type="button"
            onClick={onInverter}
            title="inverter rota completa"
            aria-label="inverter rota"
            data-testid="btn-inverter"
            disabled={paradas.length < 2}
            style={{ ...iconBtnStyle, opacity: paradas.length < 2 ? 0.4 : 1 }}
          >
            ⇅
          </button>
          <button
            type="button"
            onClick={onReorganizar}
            title="reorganizar (roteirizar tudo de novo)"
            aria-label="reorganizar rota"
            data-testid="btn-reorganizar"
            disabled={paradas.filter((p) => !p.concluida_em).length < 2 || reorganizando}
            style={{
              ...iconBtnStyle,
              opacity:
                paradas.filter((p) => !p.concluida_em).length < 2 || reorganizando ? 0.4 : 1,
            }}
          >
            {reorganizando ? '…' : '🪄'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: cores.textoMedio, marginTop: 4 }}>
        {paradas.length} paradas · {dirty && '≈ '}{kmExibido.toFixed(1)} km
        {minExibido !== null && !dirty && <> · ≈ {Math.round(minExibido)} min</>}
      </div>
      {dirty && (
        <div
          data-testid="diff-impacto"
          style={{
            marginTop: 6,
            padding: '6px 10px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 6,
            fontSize: 12,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            // flexWrap evita overflow horizontal em iPhone SE/Mini (320-375px)
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 700, color: '#9a3412' }}>↻ Mudou:</span>
          <span style={{ color: diffCor(diffKm), fontWeight: 600 }}>
            {diffSinal(parseFloat(diffKm.toFixed(1)))} km
          </span>
          {diffMin !== 0 && (
            <span style={{ color: diffCor(diffMin), fontWeight: 600 }}>
              {diffSinal(diffMin)} min
            </span>
          )}
          <span style={{ color: '#9a3412', marginLeft: 'auto', fontSize: 11 }}>
            (estimativa em linha reta)
          </span>
        </div>
      )}
    </header>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  marginBottom: 10,
};

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: cores.divisoria,
  border: `1px solid ${cores.bordaForte}`,
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  lineHeight: 1,
};

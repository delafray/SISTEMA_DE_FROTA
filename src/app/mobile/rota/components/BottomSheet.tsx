'use client';

/**
 * Bottom sheet que aparece quando o motorista toca num pino do mapa: mostra o
 * detalhe da parada + atalhos Waze/Maps + botão de concluir.
 */

import { wazeNav, googleMapsNav } from '@/lib/routing/deepLinks';
import { formatarRua, formatarJanelas } from '@/lib/routing/formatParada';
import type { Parada } from '@/lib/routing/types';
import { alvoDe } from '../alvoDe';
import { numeroStyle, btnNavStyle } from '../styles';

export function BottomSheet({
  parada,
  onFechar,
  onConcluir,
}: {
  parada: Parada;
  onFechar: () => void;
  onConcluir: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Parada ${parada.ordem}`}
      data-testid="bottom-sheet"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        padding: 16,
        zIndex: 40,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ ...numeroStyle(Boolean(parada.concluida_em), false), width: 44, height: 44, fontSize: 18 }}>
            {parada.concluida_em ? '✓' : parada.ordem}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {formatarRua(parada.endereco)}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {parada.endereco.cidade}/{parada.endereco.uf}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="fechar"
          style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      {formatarJanelas(parada.janela_horario) && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>
          ⏰ {formatarJanelas(parada.janela_horario)}
        </div>
      )}
      {parada.observacao && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>💬 {parada.observacao}</div>
      )}
      {!parada.concluida_em && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <a href={wazeNav(alvoDe(parada))} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
            🗺️ Waze
          </a>
          <a href={googleMapsNav(alvoDe(parada))} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
            🌍 Maps
          </a>
          <button type="button" onClick={onConcluir} style={btnNavStyle('#f97316')}>
            ✓ Entreguei
          </button>
        </div>
      )}
    </div>
  );
}

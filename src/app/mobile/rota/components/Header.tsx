'use client';

/**
 * Cabeçalho da tela de rota: fase atual, badge online/offline, versão do build
 * e, conforme a fase, o contador de NFs/uso-Google (captura) ou os stats
 * dinâmicos de distância/tempo (em rota).
 */

import type { Fase } from '../types';
import { headerStyle } from '../styles';

export function Header({
  fase,
  online,
  numCapturadas,
  statsDinamicos,
  usoGoogle,
}: {
  fase: Fase;
  online: boolean;
  numCapturadas: number;
  numParadas: number;
  statsDinamicos?: { proxKm: number; proxMin: number; faltamKm: number; faltamMin: number } | null;
  usoGoogle?: { total: number; limite: number } | null;
}) {
  const labelFase: Record<Fase, string> = {
    carregando: 'Carregando',
    inicio: 'Início',
    captura: 'Capturando NFs',
    otimizando: 'Otimizando',
    em_rota: 'Em rota',
  };

  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev';
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 18 }}>🚛 Rota — {labelFase[fase]}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            data-testid="build-sha"
            title="versao do build"
            style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}
          >
            v:{buildSha}
          </span>
          <span style={{ fontSize: 12 }} aria-label={online ? 'online' : 'offline'}>
            {online ? '🟢' : '🔴'}
          </span>
        </div>
      </div>
      {fase === 'captura' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#475569', marginTop: 4 }}>
          <span>
            {numCapturadas} NF{numCapturadas !== 1 ? 's' : ''} capturada{numCapturadas !== 1 ? 's' : ''}
          </span>
          {usoGoogle && (
            <span
              data-testid="uso-google"
              title="Requisições ao Google neste mês. Não sobe = veio do cache. Ao bater o teto, usa o ViaCEP."
              style={{ fontSize: 11, color: usoGoogle.total >= usoGoogle.limite ? '#dc2626' : '#94a3b8', fontFamily: 'ui-monospace, monospace' }}
            >
              🌍 {usoGoogle.total}/{usoGoogle.limite}
            </span>
          )}
        </div>
      )}
      {fase === 'em_rota' && statsDinamicos && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
          <span>Prox. {statsDinamicos.proxKm.toFixed(1)}km ≈{statsDinamicos.proxMin}min</span>
          <span>Soma total: {statsDinamicos.faltamKm.toFixed(1)}km ≈{statsDinamicos.faltamMin}min</span>
        </div>
      )}
    </header>
  );
}

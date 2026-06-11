'use client';

/**
 * Fase "início" da tela de rota: lista o histórico de rotas recentes (retomar
 * uma aberta ou marcar como concluída) e o botão de nova rota.
 */

import { useCallback, useState } from 'react';
import type { RotaOtimizada } from '@/lib/routing/types';
import { botaoPrimarioStyle } from '../styles';

const STATUS_LABEL: Record<string, string> = {
  otimizada:   'Em aberto',
  em_andamento: 'Em andamento',
  concluida:   'Concluída',
  cancelada:   'Cancelada',
};

export function FaseInicio({
  onIniciar,
  onCarregarRota,
  rotasHistorico,
  onRefetchHistorico,
  notasPendentes = 0,
  onContinuarCaptura,
}: {
  onIniciar: () => void;
  onCarregarRota: (rotaId: string) => Promise<void>;
  rotasHistorico: RotaOtimizada[];
  onRefetchHistorico: () => Promise<void>;
  // Notas que ficaram salvas quando o motorista escolheu "Salvar e voltar
  // depois" no modal de saida da captura. Quando > 0, mostramos o botao de
  // retomar (sem zerar a fila, diferente de "Nova rota").
  notasPendentes?: number;
  onContinuarCaptura?: () => void;
}) {
  const [carregando, setCarregando] = useState<string | null>(null);
  const [marcandoConcluida, setMarcandoConcluida] = useState<string | null>(null);

  // Marca rota como concluida no banco — pra "destrancar" rotas que ficaram
  // em status 'otimizada' (encerrar antigo nao salvava no banco).
  const handleForcarConcluir = useCallback(
    async (rotaId: string) => {
      setMarcandoConcluida(rotaId);
      try {
        const res = await fetch(`/api/routing/rota/${rotaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluida' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`Falhou (HTTP ${res.status}): ${data.error ?? ''} ${data.details ?? ''}`);
          return;
        }
        await onRefetchHistorico();
      } finally {
        setMarcandoConcluida(null);
      }
    },
    [onRefetchHistorico]
  );

  const aberta = (status: string) => ['otimizada', 'em_andamento'].includes(status);

  async function handleClick(rotaId: string) {
    setCarregando(rotaId);
    await onCarregarRota(rotaId);
    setCarregando(null);
  }

  return (
    <div style={{ padding: 16 }}>
      {notasPendentes > 0 && onContinuarCaptura && (
        <button
          type="button"
          onClick={onContinuarCaptura}
          data-testid="btn-continuar-captura"
          style={{
            width: '100%',
            padding: '14px',
            marginBottom: 16,
            fontSize: 15,
            fontWeight: 700,
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          ▶️ Continuar captura ({notasPendentes} nota{notasPendentes > 1 ? 's' : ''})
        </button>
      )}

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Rota do Dia</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
          Retome uma rota existente ou comece uma nova.
        </p>
        <button
          type="button"
          onClick={onIniciar}
          style={botaoPrimarioStyle}
          data-testid="btn-iniciar-topo"
        >
          🆕 Nova rota
        </button>
      </div>

      {rotasHistorico.length > 0 && (
        <section aria-label="Histórico de rotas" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Rotas recentes
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rotasHistorico.map((r) => {
              const estaAberta = aberta(r.status);
              const isLoading = carregando === r.id;
              const dataFormatada = r.criada_em
                ? new Date(r.criada_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : '';
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    data-testid={`rota-historico-${r.id}`}
                    onClick={() => handleClick(r.id)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: estaAberta ? '2px solid #fca5a5' : '1px solid #e2e8f0',
                      background: estaAberta ? '#fff1f2' : '#f8fafc',
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Linha 1: identidade da rota (pedido vinculado OU rota avulsa) + status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {estaAberta && <span style={{ fontSize: 15 }}>🔴</span>}
                        {!estaAberta && r.status === 'concluida' && <span style={{ fontSize: 15 }}>✅</span>}
                        {!estaAberta && r.status === 'cancelada' && <span style={{ fontSize: 15 }}>❌</span>}
                        {r.numero_pedido ? (
                          <span
                            data-testid={`rota-pedido-${r.id}`}
                            style={{ fontWeight: 800, fontSize: 15, color: '#1e40af', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}
                          >
                            📦 Pedido {r.numero_pedido}
                          </span>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: 14 }}>Rota avulsa</span>
                        )}
                      </span>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: estaAberta ? '#fecaca' : '#e2e8f0',
                          color: estaAberta ? '#991b1b' : '#475569',
                        }}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    {/* Linha 2: data + paradas */}
                    <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                      {dataFormatada} · {(r as unknown as Record<string, unknown>).qtd_paradas as number ?? '?'} paradas
                    </div>
                    {estaAberta && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c' }}>
                        Rota em aberto — toque para retomar ou inicie uma nova abaixo.
                      </p>
                    )}
                    {isLoading && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>Carregando…</p>
                    )}
                  </button>
                  {estaAberta && (
                    <button
                      type="button"
                      data-testid={`btn-forcar-concluida-${r.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleForcarConcluir(r.id);
                      }}
                      disabled={marcandoConcluida === r.id}
                      style={{
                        marginTop: 4,
                        width: '100%',
                        padding: '6px 10px',
                        background: 'transparent',
                        color: '#64748b',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: marcandoConcluida === r.id ? 'wait' : 'pointer',
                      }}
                    >
                      {marcandoConcluida === r.id ? 'Marcando…' : '✓ Já entreguei tudo desta rota — marcar como concluída'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={onIniciar}
        style={botaoPrimarioStyle}
        data-testid="btn-iniciar"
      >
        🆕 Nova rota
      </button>
    </div>
  );
}

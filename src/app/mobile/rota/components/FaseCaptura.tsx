'use client';

/**
 * Fase "captura" da tela de rota: formulário de captura de NF (com modo edição),
 * lista das notas capturadas com status de sync, e botão de finalizar/otimizar
 * (só habilita quando ≥90% das notas estão sincronizadas).
 */

import { useState } from 'react';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import type { NotaNaFila } from '@/lib/offline/types';
import { listaStyle, itemListaStyle, botaoPrimarioStyle } from '../styles';

const PERCENT_SYNC_MIN = 0.9; // 90% sincronizadas pra liberar Finalizar

export function FaseCaptura({
  notas,
  totalEsperado,
  onCapturar,
  onOtimizar,
  onDesfazerUltima,
  onEditar,
}: {
  notas: NotaNaFila[];
  totalEsperado?: number;
  onCapturar: (n: NotaCapturadaInput) => Promise<void>;
  onOtimizar: () => void | Promise<void>;
  onDesfazerUltima: () => void | Promise<void>;
  onEditar: (idLocal: string, dados: NotaCapturadaInput) => Promise<void>;
}) {
  const [notaEmEdicao, setNotaEmEdicao] = useState<string | null>(null);

  const stats = {
    total: notas.length,
    sincronizadas: notas.filter((n) => n.status_sync === 'sincronizada').length,
    pendentes: notas.filter((n) => n.status_sync === 'pendente').length,
    erros: notas.filter((n) => n.status_sync === 'erro').length,
  };
  const pctSync = stats.total === 0 ? 0 : stats.sincronizadas / stats.total;
  const podeFinalizar = stats.total > 0 && pctSync >= PERCENT_SYNC_MIN;
  const numeroNF = stats.total + 1;

  // Quando em modo edição, mostra o formulario preenchido com dados da nota
  if (notaEmEdicao) {
    const nota = notas.find((n) => n.id_local === notaEmEdicao);
    if (nota) {
      return (
        <div>
          <div style={{ padding: '8px 16px', background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600 }}>
            ✏️ Editando nota: {nota.endereco.logradouro || '(sem rua)'}, {nota.numero}
          </div>
          <InputEnderecoNF
            numeroNF={notas.findIndex((n) => n.id_local === notaEmEdicao) + 1}
            totalNFs={notas.length}
            initialData={{ cep: nota.cep, numero: nota.numero, endereco: nota.endereco }}
            onConfirmar={async (dados) => {
              await onEditar(notaEmEdicao, dados);
              setNotaEmEdicao(null);
            }}
            onCancelar={() => setNotaEmEdicao(null)}
          />
        </div>
      );
    }
  }

  return (
    <div>
      <InputEnderecoNF
        numeroNF={numeroNF}
        totalNFs={totalEsperado}
        onConfirmar={onCapturar}
        onDesfazerUltima={stats.total > 0 ? onDesfazerUltima : undefined}
      />

      {notas.length > 0 && (
        <section style={listaStyle} aria-label="Notas capturadas">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>
            ✓ {stats.sincronizadas} sincronizadas · ⏳ {stats.pendentes} pendentes
            {stats.erros > 0 && <> · ❌ {stats.erros} erros</>}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {notas.slice(0, 10).map((n) => (
              <li key={n.id_local} style={{ ...itemListaStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {n.status_sync === 'sincronizada' && '✓ '}
                    {n.status_sync === 'pendente' && '⏳ '}
                    {n.status_sync === 'erro' && '❌ '}
                    {n.endereco.logradouro || '(sem rua)'}, {n.numero}
                  </div>
                  {n.status_sync === 'erro' && n.ultimo_erro && (
                    <div
                      data-testid={`erro-${n.id_local}`}
                      style={{
                        marginTop: 4,
                        padding: '6px 8px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'ui-monospace, monospace',
                        wordBreak: 'break-word',
                      }}
                    >
                      {n.ultimo_erro}
                      {n.tentativas > 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.7 }}>
                          (tentativa {n.tentativas})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`btn-editar-${n.id_local}`}
                  onClick={() => setNotaEmEdicao(n.id_local)}
                  title="Editar endereço"
                  style={{
                    flexShrink: 0,
                    padding: '4px 8px',
                    fontSize: 14,
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#475569',
                    marginTop: 2,
                  }}
                >
                  ✏️
                </button>
              </li>
            ))}
            {notas.length > 10 && (
              <li style={{ color: '#64748b', padding: '4px 0' }}>…e mais {notas.length - 10}</li>
            )}
          </ul>
        </section>
      )}

      {stats.total > 0 && !podeFinalizar && (
        <div role="status" style={{ marginTop: 12, padding: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 13 }}>
          ⏳ Aguarde sincronização — só {Math.round(pctSync * 100)}% das notas estão no servidor. Mínimo: {Math.round(PERCENT_SYNC_MIN * 100)}%.
        </div>
      )}

      <button
        type="button"
        onClick={onOtimizar}
        disabled={!podeFinalizar}
        style={{
          ...botaoPrimarioStyle,
          background: podeFinalizar ? '#16a34a' : '#94a3b8',
          marginTop: 12,
          opacity: podeFinalizar ? 1 : 0.6,
        }}
        data-testid="btn-otimizar"
      >
        🎯 Finalizar e otimizar rota ({stats.total})
      </button>
    </div>
  );
}

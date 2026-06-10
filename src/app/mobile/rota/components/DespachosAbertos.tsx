'use client';

/**
 * "Rota do dia" → lista dos DESPACHOS EM ABERTO do motorista (decisão do dono,
 * 10/06/2026). Tocar num despacho abre um popup com as informações básicas e o
 * botão "Abrir Rota Para Este Pedido":
 *  - se o pedido já tem rota pré-cadastrada (roteirizada no painel), as paradas
 *    dela viram a lista editável da captura — o motorista exclui/inclui e
 *    re-roteiriza;
 *  - se não tem, segue o fluxo normal de captura — em ambos os casos a rota
 *    nasce ANCORADA no pedido (a execução aparece na aba Rota do despacho).
 */

import { useState } from 'react';
import { rotuloPedido } from '@/lib/utils/numeroPedido';

export type DespachoAberto = {
  id: string;
  numero: string | null;
  cliente: string;
  status: string;
  data_inicio_prevista: string | null;
  local_carregamento: string | null;
  qtd_entregas: number;
  destinos: string;
  tem_rota: boolean;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendado', agendado: 'Agendado', em_andamento: 'Em andamento',
};

export function DespachosAbertos({
  despachos,
  abrindo,
  onAbrirRota,
}: {
  despachos: DespachoAberto[];
  /** id do pedido sendo aberto (desabilita o botão) */
  abrindo: string | null;
  onAbrirRota: (d: DespachoAberto) => Promise<void>;
}) {
  const [selecionado, setSelecionado] = useState<DespachoAberto | null>(null);

  if (despachos.length === 0) return null;

  return (
    <section aria-label="Despachos em aberto" style={{ padding: '16px 16px 0' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#475569', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        🚚 Meus despachos em aberto
      </h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {despachos.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              data-testid={`despacho-aberto-${d.id}`}
              onClick={() => setSelecionado(d)}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 14px',
                borderRadius: 10, border: '2px solid #bfdbfe', background: '#eff6ff',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#1e40af', fontFamily: 'ui-monospace, monospace' }}>
                  {rotuloPedido(d.numero, d.id)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#1e40af' }}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 4 }}>{d.cliente}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {d.destinos}
                {d.tem_rota && <span style={{ color: '#16a34a', fontWeight: 700 }}> · 🗺️ rota pronta</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Popup com as informações básicas do despacho */}
      {selecionado && (
        <div
          data-testid="popup-despacho"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSelecionado(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 24px', width: '100%', maxWidth: 480, boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
              📦 Pedido {rotuloPedido(selecionado.numero, selecionado.id)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', margin: '4px 0 12px' }}>{selecionado.cliente}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#475569' }}>
              <div>📅 Previsto: <strong>{fmtDate(selecionado.data_inicio_prevista)}</strong></div>
              <div>📦 Entregas: <strong>{selecionado.qtd_entregas}</strong>{selecionado.destinos ? ` — ${selecionado.destinos}` : ''}</div>
              {selecionado.local_carregamento && (
                <div>📍 Carregamento: <strong>{selecionado.local_carregamento}</strong></div>
              )}
              <div>
                🗺️ Rota: {selecionado.tem_rota
                  ? <strong style={{ color: '#16a34a' }}>já existe — vou carregar pra você ajustar</strong>
                  : <strong style={{ color: '#d97706' }}>ainda não montada — você captura as notas</strong>}
              </div>
            </div>

            <button
              type="button"
              data-testid="btn-abrir-rota-pedido"
              disabled={abrindo === selecionado.id}
              onClick={async () => {
                const d = selecionado;
                await onAbrirRota(d);
                setSelecionado(null);
              }}
              style={{
                width: '100%', marginTop: 16, padding: 14,
                background: abrindo === selecionado.id ? '#94a3b8' : '#16a34a',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {abrindo === selecionado.id ? 'Abrindo…' : '🚛 Abrir Rota Para Este Pedido'}
            </button>
            <button
              type="button"
              onClick={() => setSelecionado(null)}
              style={{ width: '100%', marginTop: 8, padding: 12, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

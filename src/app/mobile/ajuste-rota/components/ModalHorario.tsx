'use client';

/**
 * ModalHorario — editor de janela de horario pra uma parada.
 *
 * MVP: 1 janela (HH:MM-HH:MM) + opcao "sem janela". Multiplas janelas
 * (manha+tarde por ex) ficam pra iteracao futura.
 *
 * Tambem permite toggle fixada (lock) e editar observacao.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.10 (modal).
 */

import { useState } from 'react';
import type { Parada } from '@/lib/routing/types';

export interface ParadaEditavel {
  fixada: boolean;
  janela_horario: [string, string][] | null;
  observacao: string | null;
}

export interface ModalHorarioProps {
  parada: Pick<Parada, 'id' | 'ordem' | 'endereco' | 'fixada' | 'janela_horario' | 'observacao'>;
  onSalvar: (mudancas: ParadaEditavel) => void;
  onFechar: () => void;
}

export function ModalHorario({ parada, onSalvar, onFechar }: ModalHorarioProps): React.ReactElement {
  const janelaInicial = parada.janela_horario?.[0];
  const [temJanela, setTemJanela] = useState(Boolean(janelaInicial));
  const [inicio, setInicio] = useState(janelaInicial?.[0] ?? '09:00');
  const [fim, setFim] = useState(janelaInicial?.[1] ?? '18:00');
  const [fixada, setFixada] = useState(parada.fixada);
  const [observacao, setObservacao] = useState(parada.observacao ?? '');

  const horarioValido = !temJanela || (inicio < fim);

  const handleSalvar = () => {
    if (!horarioValido) return;
    onSalvar({
      fixada,
      janela_horario: temJanela ? [[inicio, fim]] : null,
      observacao: observacao.trim() || null,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar parada ${parada.ordem}`}
      style={overlayStyle}
      onClick={onFechar}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Parada {parada.ordem}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          {parada.endereco.logradouro || '(sem nome)'} — {parada.endereco.cidade}/{parada.endereco.uf}
        </div>

        {/* Janela de horario */}
        <div style={secaoStyle}>
          <label style={labelCheckStyle}>
            <input
              type="checkbox"
              checked={temJanela}
              onChange={(e) => setTemJanela(e.target.checked)}
              aria-label="tem janela de horario"
            />
            <span>Restringir horario de entrega</span>
          </label>
          {temJanela && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                type="time"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                aria-label="horario inicio"
                style={inputTimeStyle}
              />
              <span>até</span>
              <input
                type="time"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                aria-label="horario fim"
                style={inputTimeStyle}
              />
            </div>
          )}
          {temJanela && !horarioValido && (
            <div role="alert" style={{ marginTop: 8, color: '#dc2626', fontSize: 13 }}>
              Horario fim precisa ser maior que inicio.
            </div>
          )}
        </div>

        {/* Fixada (lock) */}
        <div style={secaoStyle}>
          <label style={labelCheckStyle}>
            <input
              type="checkbox"
              checked={fixada}
              onChange={(e) => setFixada(e.target.checked)}
              aria-label="fixar nesta posicao"
            />
            <span>🔒 Fixar nesta posicao (VROOM nao move)</span>
          </label>
        </div>

        {/* Observacao */}
        <div style={secaoStyle}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Observacao
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex: porta lateral, subir escada, tocar buzina"
            rows={2}
            aria-label="observacao"
            style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
          />
        </div>

        {/* Botoes */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onFechar} style={botaoSecundarioStyle}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={!horarioValido}
            style={{ ...botaoPrimarioStyle, opacity: horarioValido ? 1 : 0.4 }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  width: '100%',
  maxWidth: 420,
  maxHeight: '90vh',
  overflowY: 'auto',
};

const secaoStyle: React.CSSProperties = {
  marginTop: 16,
};

const labelCheckStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  cursor: 'pointer',
};

const inputTimeStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 15,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
};

const botaoPrimarioStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  fontSize: 15,
  fontWeight: 600,
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const botaoSecundarioStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  fontSize: 15,
  background: '#f1f5f9',
  color: '#475569',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

'use client';

/**
 * InputEnderecoNF — fluxo de captura de uma NF em 3 telas:
 *
 *   1. CEP        → digita 8 digitos, auto-chama ViaCEP
 *   2. NUMERO     → mostra endereco, digita numero
 *   3. CONFIRMAR  → mostra resumo, motorista confirma/edita/cancela
 *
 * Fallback: se ViaCEP nao encontrar o CEP, abre form manual de endereco
 * (logradouro/bairro/cidade/uf).
 *
 * Mobile-first: inputMode numeric, foco automatico entre telas, vibracao
 * tatil na confirmacao, botoes grandes pra dedo gordo.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.7 (mockups visuais).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { consultarCEPBrowser } from '@/lib/cep/client';
import type { EnderecoCEP } from '@/lib/cep/types';

// ─── TIPOS ──────────────────────────────────────────────────────────

export interface NotaCapturadaInput {
  cep: string;              // 8 digitos sem hifen
  numero: string;
  endereco: EnderecoCEP;
  observacao?: string;
}

export interface InputEnderecoNFProps {
  numeroNF: number;         // contador da UI: "24" em "24 de 70"
  /** Total esperado. Se omitido (motorista nao sabe o total), header mostra so "NF X". */
  totalNFs?: number;
  onConfirmar: (nota: NotaCapturadaInput) => void | Promise<void>;
  onCancelar?: () => void;
  /** Se fornecido, mostra botão "↶ Desfazer última" no topo. Volta o estado
   *  do app removendo a ultima NF capturada (logica fica no parent). */
  onDesfazerUltima?: () => void | Promise<void>;
}

type Etapa = 'cep' | 'numero' | 'confirmar' | 'endereco_manual';

// ─── HELPERS ────────────────────────────────────────────────────────

function normalizar(cep: string): string {
  return cep.replace(/\D/g, '');
}

/** Formata enquanto digita: '01310-100' partindo de '01310100'. */
function formatarCEP(digitsApenas: string): string {
  const d = digitsApenas.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function vibrar(ms = 50): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

// ─── COMPONENTE ─────────────────────────────────────────────────────

export function InputEnderecoNF({
  numeroNF,
  totalNFs,
  onConfirmar,
  onCancelar,
  onDesfazerUltima,
}: InputEnderecoNFProps): React.ReactElement {
  const [etapa, setEtapa] = useState<Etapa>('cep');
  const [cep, setCep] = useState<string>('');           // armazenado normalizado (so digitos)
  const [endereco, setEndereco] = useState<EnderecoCEP | null>(null);
  const [numero, setNumero] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  const numeroRef = useRef<HTMLInputElement | null>(null);

  // Quando CEP atinge 8 digitos, dispara ViaCEP automaticamente.
  useEffect(() => {
    if (etapa !== 'cep') return;
    if (cep.length !== 8) return;

    let cancelado = false;
    setLoading(true);
    setErro(null);

    consultarCEPBrowser(cep).then((resultado) => {
      if (cancelado) return;
      setLoading(false);

      if (resultado.ok) {
        setEndereco(resultado.endereco);
        setEtapa('numero');
        // Foca o input de numero apos a transicao
        setTimeout(() => numeroRef.current?.focus(), 50);
        return;
      }

      // Tratamento de erros
      if (resultado.motivo === 'nao_encontrado') {
        setErro('CEP nao encontrado. Preencha o endereco manualmente.');
        setEtapa('endereco_manual');
      } else if (resultado.motivo === 'erro_rede' || resultado.motivo === 'timeout') {
        setErro('Erro de conexao. Tente novamente ou preencha manualmente.');
      } else {
        setErro('CEP invalido.');
      }
    });

    return () => {
      cancelado = true;
    };
  }, [cep, etapa]);

  const handleCepChange = useCallback((valor: string) => {
    setCep(normalizar(valor));
    setErro(null);
  }, []);

  const handleConfirmar = useCallback(async () => {
    if (!endereco || !cep || !numero) return;
    vibrar(50);
    await onConfirmar({ cep, numero, endereco });
    // Reset pra proxima NF
    setCep('');
    setNumero('');
    setEndereco(null);
    setEtapa('cep');
    setErro(null);
  }, [cep, numero, endereco, onConfirmar]);

  const handleEditar = useCallback(() => {
    setEtapa('numero');
    setTimeout(() => numeroRef.current?.focus(), 50);
  }, []);

  const handleCancelarNota = useCallback(() => {
    setCep('');
    setNumero('');
    setEndereco(null);
    setEtapa('cep');
    setErro(null);
    onCancelar?.();
  }, [onCancelar]);

  // ─── RENDER ────────────────────────────────────────────────────────

  const cabecalho = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
        NF {numeroNF}{totalNFs && totalNFs > 0 ? ` de ${totalNFs}` : ''}
      </div>
      {onDesfazerUltima && numeroNF > 1 && (
        <button
          type="button"
          onClick={() => onDesfazerUltima()}
          aria-label="desfazer ultima NF"
          style={{
            background: 'transparent',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          ↶ Desfazer última
        </button>
      )}
    </div>
  );

  if (etapa === 'cep') {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <label style={labelStyle} htmlFor="campo-cep">CEP</label>
        <input
          id="campo-cep"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="postal-code"
          value={formatarCEP(cep)}
          onChange={(e) => handleCepChange(e.target.value)}
          placeholder="00000-000"
          maxLength={9}
          autoFocus
          style={inputStyle}
          aria-label="CEP"
        />
        {loading && <div style={{ marginTop: 8, color: '#64748b' }}>Consultando CEP…</div>}
        {erro && <div role="alert" style={erroStyle}>{erro}</div>}
        {onCancelar && (
          <button type="button" onClick={onCancelar} style={botaoSecundarioStyle}>
            Cancelar
          </button>
        )}
      </div>
    );
  }

  if (etapa === 'numero' && endereco) {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <div style={enderecoBoxStyle}>
          ✓ <strong>{endereco.logradouro || '(sem nome de rua)'}</strong>
          <br />
          <span style={{ fontSize: 14, color: '#475569' }}>
            {endereco.bairro && `${endereco.bairro} — `}{endereco.cidade}/{endereco.uf}
          </span>
        </div>
        <label style={labelStyle} htmlFor="campo-numero">Numero</label>
        <input
          ref={numeroRef}
          id="campo-numero"
          type="text"
          inputMode="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="123 ou S/N"
          maxLength={20}
          style={inputStyle}
          aria-label="Numero"
        />
        <button
          type="button"
          onClick={() => numero.trim() && setEtapa('confirmar')}
          disabled={!numero.trim()}
          style={{ ...botaoPrimarioStyle, opacity: numero.trim() ? 1 : 0.4 }}
        >
          → Confirmar
        </button>
        <button type="button" onClick={() => setEtapa('cep')} style={botaoSecundarioStyle}>
          ← Voltar (mudar CEP)
        </button>
      </div>
    );
  }

  if (etapa === 'confirmar' && endereco) {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Confirmar?</div>
        <div style={enderecoBoxStyle}>
          📍 <strong>{endereco.logradouro || '(sem nome de rua)'}, {numero}</strong>
          <br />
          <span style={{ fontSize: 14, color: '#475569' }}>
            {endereco.bairro && `${endereco.bairro}, `}{endereco.cidade}/{endereco.uf}
            <br />
            CEP {formatarCEP(cep)}
          </span>
        </div>
        <button type="button" onClick={handleConfirmar} style={botaoPrimarioStyle}>
          ✅ Confirmar e proxima
        </button>
        <button type="button" onClick={handleEditar} style={botaoSecundarioStyle}>
          ✏️ Editar
        </button>
        <button type="button" onClick={handleCancelarNota} style={{ ...botaoSecundarioStyle, color: '#dc2626' }}>
          ❌ Cancelar esta NF
        </button>
      </div>
    );
  }

  // Fallback: CEP nao encontrado → form manual
  if (etapa === 'endereco_manual') {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <div role="alert" style={erroStyle}>{erro ?? 'Preencha o endereco manualmente.'}</div>
        <FormEnderecoManual
          cepInicial={cep}
          onPreencher={(end) => {
            setEndereco(end);
            setEtapa('numero');
            setTimeout(() => numeroRef.current?.focus(), 50);
          }}
          onVoltar={() => {
            setErro(null);
            setEtapa('cep');
          }}
        />
      </div>
    );
  }

  return <div style={containerStyle}>{cabecalho}<div>Carregando…</div></div>;
}

// ─── SUB-COMPONENTE: form manual ────────────────────────────────────

interface FormManualProps {
  cepInicial: string;
  onPreencher: (endereco: EnderecoCEP) => void;
  onVoltar: () => void;
}

function FormEnderecoManual({ cepInicial, onPreencher, onVoltar }: FormManualProps): React.ReactElement {
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  const valido = cidade.trim().length > 0 && uf.trim().length === 2;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        CEP: <strong>{cepInicial}</strong>
      </div>
      <label style={labelStyle}>Logradouro</label>
      <input style={inputStyle} value={logradouro} onChange={(e) => setLogradouro(e.target.value)} aria-label="Logradouro" />
      <label style={labelStyle}>Bairro</label>
      <input style={inputStyle} value={bairro} onChange={(e) => setBairro(e.target.value)} aria-label="Bairro" />
      <label style={labelStyle}>Cidade</label>
      <input style={inputStyle} value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade" />
      <label style={labelStyle}>UF (2 letras)</label>
      <input
        style={inputStyle}
        value={uf}
        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
        maxLength={2}
        aria-label="UF"
      />
      <button
        type="button"
        onClick={() => valido && onPreencher({ logradouro, bairro, cidade, uf })}
        disabled={!valido}
        style={{ ...botaoPrimarioStyle, opacity: valido ? 1 : 0.4 }}
      >
        → Usar este endereco
      </button>
      <button type="button" onClick={onVoltar} style={botaoSecundarioStyle}>
        ← Tentar outro CEP
      </button>
    </div>
  );
}

// ─── ESTILOS INLINE (mobile-first, sem dependencia de design system) ─

const containerStyle: React.CSSProperties = {
  padding: 16,
  maxWidth: 480,
  margin: '0 auto',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#334155',
  marginTop: 12,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 12px',
  fontSize: 18,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  boxSizing: 'border-box',
};

const enderecoBoxStyle: React.CSSProperties = {
  padding: 12,
  background: '#f1f5f9',
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 15,
};

const botaoPrimarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginTop: 16,
};

const botaoSecundarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: 14,
  background: 'transparent',
  color: '#475569',
  border: 'none',
  cursor: 'pointer',
  marginTop: 8,
};

const erroStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 6,
  fontSize: 14,
};

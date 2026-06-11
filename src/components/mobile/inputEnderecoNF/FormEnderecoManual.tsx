'use client';

/**
 * FormEnderecoManual — fallback quando o CEP não é encontrado no ViaCEP.
 * O motorista preenche logradouro / bairro / cidade / UF manualmente.
 *
 * Campos mínimos obrigatórios: cidade (> 0 chars) e UF (exatamente 2 letras).
 * Logradouro e bairro são opcionais — ruas sem nome ou bairros genéricos existem.
 */

import { useState } from 'react';
import type { EnderecoCEP } from '@/lib/cep/types';
import { cores } from '@/lib/mobile/ui';
import { labelStyle, inputStyle, botaoPrimarioStyle, botaoSecundarioStyle } from './estilos';

interface FormEnderecoManualProps {
  cepInicial: string;
  onPreencher: (endereco: EnderecoCEP) => void;
  onVoltar: () => void;
}

export function FormEnderecoManual({
  cepInicial,
  onPreencher,
  onVoltar,
}: FormEnderecoManualProps): React.ReactElement {
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  const valido = cidade.trim().length > 0 && uf.trim().length === 2;

  return (
    <div>
      <div style={{ fontSize: 13, color: cores.textoFraco, marginBottom: 12 }}>
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

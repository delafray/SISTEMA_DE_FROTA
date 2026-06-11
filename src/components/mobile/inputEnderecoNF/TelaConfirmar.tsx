'use client';

/**
 * TelaConfirmar — tela de revisão e confirmação do endereço.
 *
 * Usada pelos dois caminhos (CEP e voz): mostra o endereço, campo de número
 * editável, badge de validação e botões de confirmar / voltar / cancelar.
 *
 * O campo de número nasce focado quando não há número pré-preenchido.
 * O badge de validação (Overpass) nunca bloqueia o fluxo — só informa.
 */

import type { RefObject } from 'react';
import type { EnderecoCEP } from '@/lib/cep/types';
import { cores } from '@/lib/mobile/ui';
import { formatarCEPDigitando } from '@/lib/cep/formatarCEP';
import { BadgeValidacao, type StatusValidacao } from './BadgeValidacao';
import { CabecalhoNF } from './CabecalhoNF';
import {
  containerStyle,
  labelStyle,
  inputStyle,
  enderecoBoxStyle,
  botaoPrimarioStyle,
  botaoSecundarioStyle,
} from './estilos';

interface TelaConfirmarProps {
  numeroNF: number;
  totalNFs?: number;
  onDesfazerUltima?: () => void | Promise<void>;
  cep: string;
  endereco: EnderecoCEP;
  numero: string;
  validacao: { status: StatusValidacao; mensagem?: string } | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onNumeroChange: (v: string) => void;
  onConfirmar: () => void;
  onVoltar: () => void;
  onCancelar: () => void;
}

export function TelaConfirmar({
  numeroNF,
  totalNFs,
  onDesfazerUltima,
  cep,
  endereco,
  numero,
  validacao,
  inputRef,
  onNumeroChange,
  onConfirmar,
  onVoltar,
  onCancelar,
}: TelaConfirmarProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      <CabecalhoNF numeroNF={numeroNF} totalNFs={totalNFs} onDesfazerUltima={onDesfazerUltima} />
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Confirmar?</div>
      <div style={enderecoBoxStyle}>
        📍 <strong>{endereco.logradouro || '(sem nome de rua)'}{numero.trim() ? `, ${numero.trim()}` : ''}</strong>
        <br />
        <span style={{ fontSize: 14, color: cores.textoMedio }}>
          {endereco.bairro && `${endereco.bairro}, `}{endereco.cidade}/{endereco.uf}
          {cep && (
            <>
              <br />
              CEP {formatarCEPDigitando(cep)}
            </>
          )}
        </span>
      </div>
      <label style={labelStyle} htmlFor="campo-numero">Numero</label>
      <input
        ref={inputRef}
        id="campo-numero"
        type="text"
        inputMode="text"
        value={numero}
        onChange={(e) => onNumeroChange(e.target.value)}
        placeholder="123 ou S/N"
        maxLength={20}
        style={inputStyle}
        aria-label="Numero"
      />
      {validacao && <BadgeValidacao status={validacao.status} mensagem={validacao.mensagem} />}
      <button
        type="button"
        onClick={onConfirmar}
        disabled={!numero.trim()}
        style={{ ...botaoPrimarioStyle, opacity: numero.trim() ? 1 : 0.4 }}
      >
        ✅ Confirmar e proxima
      </button>
      <button type="button" onClick={onVoltar} style={botaoSecundarioStyle}>
        ← Voltar (trocar endereco)
      </button>
      <button type="button" onClick={onCancelar} style={{ ...botaoSecundarioStyle, color: cores.vermelho }}>
        ❌ Cancelar esta NF
      </button>
    </div>
  );
}

// Exporta o tipo para o arquivo principal não precisar reimportar de BadgeValidacao
export type { StatusValidacao };

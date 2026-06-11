'use client';

/**
 * TelaCEP — primeira tela do fluxo: entrada de CEP + microfone + câmera.
 *
 * O motorista digita o CEP, fala o endereço ou fotografa a nota. Quando o
 * CEP atinge 8 dígitos o pai dispara a consulta ViaCEP automaticamente.
 *
 * Não tem estado próprio — recebe tudo via props.
 */

import type { EnderecoOCR } from '@/lib/ocr/extrairEnderecoDeOCR';
import type { ResultadoOCR } from '@/lib/ocr/lerImagem';
import { cores } from '@/lib/mobile/ui';
import { formatarCEPDigitando } from '@/lib/cep/formatarCEP';
import { BotaoMicrofone } from '../BotaoMicrofone';
import { BotaoCamera } from '../BotaoCamera';
import {
  containerStyle,
  inputStyle,
  botaoPrimarioStyle,
  botaoSecundarioStyle,
  erroStyle,
  ocrParcialStyle,
  dicaOcrStyle,
} from './estilos';
import { MAX_FOTOS_OCR } from './useOcrState';

interface TelaCEPProps {
  cep: string;
  loading: boolean;
  erro: string | null;
  buscandoEndereco: boolean;
  ocrLendo: boolean;
  ocrParcial: EnderecoOCR | null;
  ocrDica: string | null;
  ocrFotos: number;
  onCepChange: (valor: string) => void;
  onTranscricao: (texto: string) => Promise<void>;
  onOcrTexto: (resultado: ResultadoOCR) => void;
  onOcrLendoChange: (lendo: boolean) => void;
  onOcrErro: (msg: string) => void;
  onContinuarComOcr: () => void;
  onCancelar?: () => void;
}

export function TelaCEP({
  cep,
  loading,
  erro,
  buscandoEndereco,
  ocrLendo,
  ocrParcial,
  ocrDica,
  ocrFotos,
  onCepChange,
  onTranscricao,
  onOcrTexto,
  onOcrLendoChange,
  onOcrErro,
  onContinuarComOcr,
  onCancelar,
}: TelaCEPProps): React.ReactElement {
  const ocupado = loading || buscandoEndereco || ocrLendo;

  return (
    <div style={{ ...containerStyle, paddingTop: 6 }}>
      {/* Linha única: label "CEP" + input + botão mic + botão câmera */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <label
          htmlFor="campo-cep"
          style={{ fontSize: 13, fontWeight: 700, color: cores.textoForte, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          CEP
        </label>
        <input
          id="campo-cep"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="postal-code"
          value={formatarCEPDigitando(cep)}
          onChange={(e) => onCepChange(e.target.value)}
          placeholder="00000-000"
          maxLength={9}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          aria-label="CEP"
        />
        <BotaoMicrofone onTranscricao={onTranscricao} disabled={ocupado} tamanho={40} />
        <BotaoCamera
          onTexto={onOcrTexto}
          onLendoChange={onOcrLendoChange}
          onErro={onOcrErro}
          disabled={ocupado}
          tamanho={40}
        />
      </div>

      {ocrLendo && (
        <div role="status" data-testid="ocr-lendo" style={{ marginTop: 12, color: cores.azul, textAlign: 'center', fontWeight: 600 }}>
          📷 Lendo a nota… aguarde
        </div>
      )}

      {ocrParcial?.cep && !ocrLendo && (
        <div role="status" data-testid="ocr-parcial" style={ocrParcialStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            ✓ CEP {formatarCEPDigitando(ocrParcial.cep)} lido — faltou o número.
          </div>
          <div style={{ marginBottom: 10 }}>
            Toque 📷 e tire um close do número <strong>com o rótulo</strong> (ex.: Nº 123) — foto {ocrFotos + 1} de {MAX_FOTOS_OCR} — ou siga e digite.
          </div>
          <button
            type="button"
            onClick={onContinuarComOcr}
            data-testid="ocr-continuar"
            style={{ ...botaoPrimarioStyle, marginTop: 0 }}
          >
            → Continuar (digito o número)
          </button>
        </div>
      )}

      {ocrDica && <div role="status" data-testid="ocr-dica" style={dicaOcrStyle}>{ocrDica}</div>}
      {buscandoEndereco && <div style={{ marginTop: 12, color: cores.azul, textAlign: 'center', fontWeight: 600 }}>🔍 Buscando endereço...</div>}
      {loading && <div style={{ marginTop: 12, color: cores.textoFraco, textAlign: 'center' }}>Consultando CEP…</div>}
      {erro && <div role="alert" style={erroStyle}>{erro}</div>}

      {onCancelar && (
        <button type="button" onClick={onCancelar} style={botaoSecundarioStyle}>
          Cancelar
        </button>
      )}
    </div>
  );
}

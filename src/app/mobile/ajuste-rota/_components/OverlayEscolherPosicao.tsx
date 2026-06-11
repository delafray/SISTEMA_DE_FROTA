'use client';

/**
 * OverlayEscolherPosicao — dialog de escolha de onde inserir uma nova parada.
 *
 * Aparece no segundo passo do fluxo de adicionar parada:
 *   capturando (CEP) → escolhendo (esta tela) → adicionando → fechado
 *
 * Dois botoes: "Reotimizar" (melhor posicao) ou "Ultima entrega" (final da fila).
 * Enquanto modoAdicao='adicionando', botoes ficam disabled e aparece spinner.
 */

import type { NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { cores } from '@/lib/mobile/ui';

export interface OverlayEscolherPosicaoProps {
  dadosNovaParada: NotaCapturadaInput;
  /** 'escolhendo' = aguardando decisao | 'adicionando' = requisicao em flight */
  modoAdicao: 'escolhendo' | 'adicionando';
  erroAdicionar: string | null;
  onConfirmar: (posicao: 'final' | 'reotimizar') => void;
  onCancelar: () => void;
}

export function OverlayEscolherPosicao({
  dadosNovaParada,
  modoAdicao,
  erroAdicionar,
  onConfirmar,
  onCancelar,
}: OverlayEscolherPosicaoProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-label="onde adicionar a parada"
      data-testid="overlay-escolher"
      style={overlayStyle}
      onClick={modoAdicao === 'escolhendo' ? onCancelar : undefined}
    >
      <div style={overlayModalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Onde adicionar?
        </div>
        <div style={{ fontSize: 13, color: cores.textoFraco, marginBottom: 16 }}>
          📍 {dadosNovaParada.endereco.logradouro}, {dadosNovaParada.numero}
        </div>

        <button
          type="button"
          onClick={() => onConfirmar('reotimizar')}
          disabled={modoAdicao === 'adicionando'}
          data-testid="btn-reotimizar"
          style={{
            ...overlayBotaoPrincipal,
            background: cores.verde,
            opacity: modoAdicao === 'adicionando' ? 0.5 : 1,
          }}
        >
          🎯 Reotimizar — melhor posição
          <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
            Mantém ordem atual e encaixa onde gerar menos KM extra
          </div>
        </button>

        <button
          type="button"
          onClick={() => onConfirmar('final')}
          disabled={modoAdicao === 'adicionando'}
          data-testid="btn-final"
          style={{
            ...overlayBotaoPrincipal,
            background: cores.azul,
            opacity: modoAdicao === 'adicionando' ? 0.5 : 1,
          }}
        >
          📍 Última entrega
          <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
            Vai pro final da fila — depois você reorganiza se quiser
          </div>
        </button>

        <button
          type="button"
          onClick={onCancelar}
          disabled={modoAdicao === 'adicionando'}
          style={overlayBotaoSecundario}
        >
          Cancelar
        </button>

        {modoAdicao === 'adicionando' && (
          <div role="status" style={{ marginTop: 12, fontSize: 13, color: cores.textoMedio, textAlign: 'center' }}>
            ⏳ Geocodificando e adicionando…
          </div>
        )}

        {erroAdicionar && (
          <div role="alert" style={{ ...erroStyle, marginTop: 12 }}>
            {erroAdicionar}
          </div>
        )}
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
  zIndex: 60,
  padding: 12,
};

const overlayModalStyle: React.CSSProperties = {
  background: cores.branco,
  borderRadius: 12,
  padding: 16,
  width: '100%',
  maxWidth: 420,
  maxHeight: '92vh',
  overflowY: 'auto',
};

const overlayBotaoPrincipal: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  marginBottom: 8,
  fontSize: 15,
  fontWeight: 700,
  color: cores.branco,
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
};

const overlayBotaoSecundario: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: 'transparent',
  color: cores.textoFraco,
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
};

const erroStyle: React.CSSProperties = {
  padding: 12,
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  borderRadius: 8,
  fontSize: 14,
};

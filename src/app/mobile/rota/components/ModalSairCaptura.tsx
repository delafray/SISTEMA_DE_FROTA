'use client';

/**
 * Modal de confirmacao ao apertar "Voltar" no meio da captura de NFs.
 *
 * Antes, o botao Voltar do celular descartava a captura silenciosamente (caia
 * pra tela inicial e o unico caminho de volta — "Nova rota" — limpava a fila).
 * O motorista capturava 5-10 NFs e perdia tudo num toque sem querer.
 *
 * Agora abre este popup com 3 saidas claras:
 *   - Continuar capturando (fica na captura — caso mais comum, e o "voltar" foi sem querer)
 *   - Salvar e voltar depois (mantem as NFs; retoma pela tela inicial)
 *   - Descartar tudo (apaga a fila local + as notas no banco)
 */

import { cores, raio } from '@/lib/mobile/ui';

export function ModalSairCaptura({
  quantidade,
  onContinuar,
  onSalvar,
  onDescartar,
}: {
  quantidade: number;
  onContinuar: () => void;
  onSalvar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div
      data-testid="modal-sair-captura"
      role="dialog"
      aria-modal="true"
      aria-label="Sair da captura"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: cores.branco,
          borderRadius: raio.lg,
          padding: 20,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: cores.texto }}>
          Sair da captura?
        </h2>
        <p style={{ fontSize: 14, color: cores.textoFraco, margin: '0 0 18px' }}>
          Você tem <strong>{quantidade}</strong> NF{quantidade > 1 ? 's' : ''} capturada
          {quantidade > 1 ? 's' : ''}. O que deseja fazer?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Acao mais provavel (voltou sem querer) primeiro e em destaque */}
          <button
            type="button"
            data-testid="btn-continuar-capturando"
            onClick={onContinuar}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: 15,
              fontWeight: 700,
              background: cores.verde,
              color: cores.branco,
              border: 'none',
              borderRadius: raio.md,
              cursor: 'pointer',
            }}
          >
            ▶️ Continuar capturando
          </button>

          <button
            type="button"
            data-testid="btn-salvar-sair"
            onClick={onSalvar}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: 15,
              fontWeight: 600,
              background: cores.fundoAzul,
              color: cores.azulTexto,
              border: `1px solid ${cores.bordaAzul}`,
              borderRadius: raio.md,
              cursor: 'pointer',
            }}
          >
            💾 Salvar e voltar depois
          </button>

          <button
            type="button"
            data-testid="btn-descartar-tudo"
            onClick={onDescartar}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontWeight: 600,
              background: 'transparent',
              color: cores.vermelhoTexto,
              border: `1px solid ${cores.bordaVermelha}`,
              borderRadius: raio.md,
              cursor: 'pointer',
            }}
          >
            🗑️ Descartar tudo
          </button>
        </div>
      </div>
    </div>
  );
}

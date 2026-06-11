'use client';

/**
 * PopupAdicao — bottom-sheet que aparece quando o motorista toca ➕
 * em uma rota que ainda NAO foi iniciada (sem baixa).
 *
 * Pergunta se quer CONTINUAR a roteirizacao em lote (ex.: parou na 25a
 * de 70 notas) ou apenas adicionar UM endereco. Rota ja iniciada vai
 * direto no "adicionar um" sem passar por aqui.
 *
 * Referencia: decisao do dono 10/06.
 */

export interface PopupAdicaoProps {
  paradasLength: number;
  /** URL completa pra navegar quando usuario escolher "continuar em lote". */
  urlContinuarLote: string;
  onAdicionarUm: () => void;
  onFechar: () => void;
}

export function PopupAdicao({
  paradasLength,
  urlContinuarLote,
  onAdicionarUm,
  onFechar,
}: PopupAdicaoProps): React.ReactElement {
  return (
    <div
      data-testid="popup-adicao"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onFechar}
    >
      <div
        style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 24px', width: '100%', maxWidth: 480, boxSizing: 'border-box' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>➕ O que você quer fazer?</div>
        <p style={{ fontSize: 13, color: '#475569', margin: '8px 0 14px', lineHeight: 1.5 }}>
          A rota ainda não começou — dá pra voltar e <strong>lançar várias notas de uma vez</strong> (continua de onde parou, com as {paradasLength} já lançadas na lista) ou incluir só um endereço aqui.
        </p>
        <button
          type="button"
          data-testid="btn-continuar-lote"
          onClick={() => { window.location.href = urlContinuarLote; }}
          style={{ width: '100%', padding: 14, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
        >
          Continuar roteirização (lançar várias)
        </button>
        <button
          type="button"
          data-testid="btn-adicionar-um"
          onClick={onAdicionarUm}
          style={{ width: '100%', marginTop: 8, padding: 14, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Adicionar um endereço
        </button>
        <button
          type="button"
          onClick={onFechar}
          style={{ width: '100%', marginTop: 8, padding: 12, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

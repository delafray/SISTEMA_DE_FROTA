'use client';

/**
 * CabecalhoNF — cabeçalho do InputEnderecoNF.
 *
 * Mostra "NF X de Y" (ou só "NF X" quando totalNFs não é fornecido) e,
 * quando disponível, o botão "↶ Desfazer última" (visível a partir da 2ª NF).
 */

import { cores } from '@/lib/mobile/ui';

interface CabecalhoNFProps {
  numeroNF: number;
  totalNFs?: number;
  onDesfazerUltima?: () => void | Promise<void>;
}

export function CabecalhoNF({
  numeroNF,
  totalNFs,
  onDesfazerUltima,
}: CabecalhoNFProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: cores.textoFraco }}>
        NF {numeroNF}{totalNFs && totalNFs > 0 ? ` de ${totalNFs}` : ''}
      </div>
      {onDesfazerUltima && numeroNF > 1 && (
        <button
          type="button"
          onClick={() => onDesfazerUltima()}
          aria-label="desfazer ultima NF"
          style={{
            background: 'transparent',
            border: `1px solid ${cores.bordaForte}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: cores.textoFraco,
            cursor: 'pointer',
          }}
        >
          ↶ Desfazer última
        </button>
      )}
    </div>
  );
}

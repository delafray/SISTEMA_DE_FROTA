/**
 * Estilos inline do InputEnderecoNF e seus sub-componentes.
 *
 * Mobile-first, sem dependência de design system. Valores extraídos
 * diretamente do arquivo original — nenhuma mudança visual.
 */

import { cores } from '@/lib/mobile/ui';

export const containerStyle: React.CSSProperties = {
  padding: 16,
  maxWidth: 480,
  margin: '0 auto',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: cores.textoForte,
  marginTop: 12,
  marginBottom: 4,
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 12px',
  fontSize: 18,
  border: `1px solid ${cores.bordaForte}`,
  borderRadius: 8,
  boxSizing: 'border-box',
};

export const enderecoBoxStyle: React.CSSProperties = {
  padding: 12,
  background: cores.divisoria,
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 15,
};

export const botaoPrimarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: cores.azul,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginTop: 16,
};

export const botaoSecundarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: 14,
  background: 'transparent',
  color: cores.textoMedio,
  border: 'none',
  cursor: 'pointer',
  marginTop: 8,
};

export const erroStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  borderRadius: 6,
  fontSize: 14,
};

/** Cartão parcial do OCR: CEP lido mas número faltando — tom verde, oferece nova foto. */
export const ocrParcialStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: '#f0fdf4',
  border: '1px solid #86efac',
  color: '#166534',
  borderRadius: 8,
  fontSize: 14,
  lineHeight: 1.5,
};

/** Dica do OCR (reenquadrar / conferir) — informativa, tom âmbar, não bloqueia. */
export const dicaOcrStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: cores.fundoAmbar,
  color: cores.textoAmbar,
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.5,
};

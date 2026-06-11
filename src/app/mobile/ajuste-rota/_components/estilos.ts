/**
 * Estilos inline da tela Ajuste de Rota — centralizados aqui pra
 * nao poluir a page.tsx com objetos CSSProperties dispersos.
 */

import { cores } from '@/lib/mobile/ui';

export const containerStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: 12,
  // Safety net pra qualquer elemento que ultrapasse o limite — em telefones de
  // 320-375px (iPhone SE/Mini), evita scroll horizontal indesejado.
  overflowX: 'hidden',
  // Espacamento pra status bar e botoes do sistema (iPhone com notch)
  paddingTop: 'max(12px, env(safe-area-inset-top))',
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
};

export const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 12,
  marginBottom: 10,
  borderBottom: `1px solid ${cores.borda}`,
};

export const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: cores.textoFraco,
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: 14,
};

export const tabAtivoStyle: React.CSSProperties = {
  color: cores.azul,
  borderBottomColor: cores.azul,
  fontWeight: 700,
};

export const botaoSalvarStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  marginTop: 16,
  fontSize: 16,
  fontWeight: 600,
  background: cores.verde,
  color: cores.branco,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

export const erroStyle: React.CSSProperties = {
  padding: 12,
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  borderRadius: 8,
  fontSize: 14,
};

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
  padding: 12,
};

export const overlayModalStyle: React.CSSProperties = {
  background: cores.branco,
  borderRadius: 12,
  padding: 16,
  width: '100%',
  maxWidth: 420,
  maxHeight: '92vh',
  overflowY: 'auto',
};

/**
 * Estilos da tela de rota (mobile). Extraídos do page.tsx pra serem
 * compartilhados entre os sub-componentes (Header, FaseInicio, FaseEmRota, …).
 * Cores vêm dos tokens em `@/lib/mobile/ui` (mesma paleta, fonte única).
 */

import type { CSSProperties } from 'react';
import { cores } from '@/lib/mobile/ui';

export const containerStyle: CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: 16,
};

export const headerStyle: CSSProperties = {
  padding: 12,
  background: cores.branco,
  borderRadius: 8,
  border: `1px solid ${cores.borda}`,
  marginBottom: 12,
};

export const listaStyle: CSSProperties = {
  background: cores.fundoApp,
  borderRadius: 8,
  padding: 12,
};

export const itemListaStyle: CSSProperties = {
  padding: '6px 0',
  borderBottom: `1px solid ${cores.borda}`,
};

export const botaoPrimarioStyle: CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: cores.azul,
  color: cores.branco,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

export const erroStyle: CSSProperties = {
  padding: 12,
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  borderRadius: 8,
  fontSize: 14,
  marginBottom: 12,
};

// Botões da fase em_rota — fundos bem DISTINTOS (decisão do dono 10/06):
// Ajustar/Incluir = azul sólido (ação construtiva); Encerrar = vermelho claro
// com borda (destrutiva — e protegida por popup de confirmação).
export const btnLinkStyle: CSSProperties = {
  flex: 1,
  padding: '10px',
  background: cores.azul,
  color: '#fff',
  textAlign: 'center',
  borderRadius: 8,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

export const btnEncerrarStyle: CSSProperties = {
  flex: 1,
  padding: '10px',
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  border: `1px solid ${cores.bordaVermelha}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export function paradaItemStyle(concluida: boolean, destacada = false): CSSProperties {
  return {
    padding: 12,
    background: concluida ? cores.fundoVerde : cores.branco,
    border: destacada ? `2px solid ${cores.laranja}` : `1px solid ${cores.borda}`,
    borderRadius: 8,
    marginBottom: 8,
    opacity: concluida ? 0.7 : 1,
    boxShadow: destacada ? '0 0 0 3px rgba(249,115,22,0.2)' : undefined,
    cursor: 'pointer',
  };
}

export function numeroStyle(concluida: boolean, ehProxima = false): CSSProperties {
  return {
    width: 36,
    height: 36,
    flexShrink: 0,
    background: concluida ? cores.verde : ehProxima ? cores.laranja : cores.azul,
    color: cores.branco,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
  };
}

export const proximaCardStyle: CSSProperties = {
  marginTop: 16,
  padding: 16,
  background: cores.fundoAmbar,
  border: `2px solid ${cores.laranja}`,
  borderRadius: 12,
  boxShadow: '0 4px 12px rgba(249,115,22,0.2)',
};

export function btnNavStyle(bg: string): CSSProperties {
  return {
    flex: 1,
    padding: '8px',
    background: bg,
    color: cores.branco,
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
    cursor: 'pointer',
  };
}

/**
 * Tokens de UI das telas mobile (motorista) — fonte única da paleta.
 *
 * Antes, os mesmos hex (#2563eb, #16a34a, #64748b, …) estavam espalhados em
 * estilos inline por todas as telas mobile. Centralizar aqui dá consistência e
 * um lugar só pra ajustar a marca. Os VALORES são exatamente os que já estavam
 * em uso — adotar `cores` não muda nada visualmente.
 */

export const cores = {
  // Ações / marca
  azul: '#2563eb',        // ação primária (pendente, links)
  azulEscuro: '#1d4ed8',  // aprendizado/realce azul
  azulTexto: '#1e40af',   // texto de selo "em andamento"
  verde: '#16a34a',       // sucesso / confirmar entrega
  verdeEscuro: '#15803d', // gradiente do botão de rota
  laranja: '#f97316',     // próxima parada (destaque)
  ambar: '#f59e0b',       // ação de abastecimento

  // Alertas
  vermelho: '#dc2626',
  vermelhoTexto: '#991b1b',

  // Texto (forte → suave)
  texto: '#0f172a',
  textoForte: '#334155',  // slate-700
  textoMedio: '#475569',
  textoFraco: '#64748b',
  textoSuave: '#94a3b8',

  // Superfícies / linhas
  branco: '#ffffff',
  fundoApp: '#f8fafc',
  borda: '#e2e8f0',
  bordaForte: '#cbd5e1',
  divisoria: '#f1f5f9',
  headerEscuro: '#313f50', // cabeçalho da tela do motorista
  superficieEscura: '#1e293b', // banner de instalar PWA

  // Fundos de estado (com texto e borda correspondentes)
  fundoAmbar: '#fffbeb',
  fundoAmbarClaro: '#fef3c7',
  textoAmbar: '#92400e',
  bordaAmbar: '#fde68a',
  fundoVerde: '#f0fdf4',
  textoVerde: '#166534',
  bordaVerde: '#bbf7d0',
  fundoVermelho: '#fef2f2',
  bordaVermelha: '#fecaca',
  fundoAzul: '#eff6ff',
  bordaAzul: '#bfdbfe',
} as const;

/**
 * Conjuntos de cor por status de rota (selo/badge). Reúne os tints específicos
 * (-200 borda, -800 texto) que se repetiam na tela do motorista e no histórico.
 */
export const statusRota: Record<string, { bg: string; texto: string; borda: string }> = {
  concluida:    { bg: cores.fundoVerde,   texto: cores.textoVerde,   borda: cores.bordaVerde },
  em_andamento: { bg: cores.fundoAzul,    texto: cores.azulTexto,    borda: cores.bordaAzul },
  otimizada:    { bg: cores.fundoAmbar,   texto: cores.textoAmbar,   borda: cores.bordaAmbar },
  rascunho:     { bg: cores.fundoApp,     texto: cores.textoFraco,   borda: cores.borda },
  cancelada:    { bg: cores.fundoVermelho, texto: cores.vermelhoTexto, borda: cores.bordaVermelha },
};

/** Espaçamentos base (px) — escala simples usada nos cards/listas mobile. */
export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** Raios de borda comuns. */
export const raio = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

/**
 * Parsers puros do motor do bot (sem I/O) — testáveis isoladamente.
 * Confirmação sim/não e seleção numérica/por-nome em desambiguação.
 * Listas de afirmação/negação baseadas na pesquisa (Botium/Cerb yes-no).
 */

export const AFIRMA = new Set(["sim", "s", "si", "claro", "confirma", "confirmo", "confirmado", "pode", "ok", "okay", "isso", "exato", "blz", "beleza", "manda", "bora", "positivo", "vai", "👍", "✅", "1"]);
export const NEGA = new Set(["nao", "n", "nope", "cancela", "cancelar", "para", "deixa", "esquece", "errado", "nada", "negativo", "👎", "❌"]);
export const CANCELA = new Set(["nenhuma", "nenhum", "outro", "outra", "cancela", "cancelar", "nada"]);

export function norm(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "sim/não" → true/false/null (ambíguo → null, default seguro = não executar). */
export function parseSimNao(texto: string): boolean | null {
  const t = norm(texto).replace(/[.!,]/g, "");
  if (NEGA.has(t)) return false;
  if (AFIRMA.has(t)) return true;
  return null;
}

/** Resposta → índice da opção, -1 = cancelar ("nenhuma"), null = não entendi. */
export function parseSelecao(texto: string, opcoes: string[]): number | null | -1 {
  const t = norm(texto).replace(/[.!,]/g, "");
  if (CANCELA.has(t)) return -1;
  const num = t.match(/^(\d{1,2})$/);
  if (num) { const i = Number(num[1]) - 1; return i >= 0 && i < opcoes.length ? i : null; }
  const idx = opcoes.findIndex((o) => norm(o).includes(t) && t.length >= 3);
  return idx >= 0 ? idx : null;
}

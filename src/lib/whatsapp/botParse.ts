/**
 * Parsers puros do motor do bot (sem I/O) — testáveis isoladamente.
 * Confirmação sim/não e seleção numérica/por-nome em desambiguação.
 * Listas de afirmação/negação baseadas na pesquisa (Botium/Cerb yes-no).
 */

export const AFIRMA = new Set(["sim", "s", "si", "claro", "confirma", "confirmo", "confirmado", "pode", "ok", "okay", "isso", "exato", "blz", "beleza", "manda", "bora", "positivo", "vai", "👍", "✅", "1"]);
export const NEGA = new Set(["nao", "n", "nope", "cancela", "cancelar", "para", "deixa", "esquece", "errado", "nada", "negativo", "👎", "❌"]);
export const CANCELA = new Set(["nenhuma", "nenhum", "outro", "outra", "cancela", "cancelar", "nada"]);
// Palavras que ZERAM o contexto da conversa (estado pendente).
export const RESET = new Set(["novo", "nova", "limpar", "limpa", "limpar", "recomecar", "reset", "resetar", "comecar de novo", "comecar denovo", "menu", "cancelar tudo", "do zero"]);

export function norm(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Mensagem que pede pra limpar todo o contexto ("novo", "nova", "limpar"…). */
export function ehReset(texto: string): boolean {
  return RESET.has(norm(texto).replace(/[.!,/]/g, "").trim());
}

/** normaliza colapsando pontuação em espaço (pra checar início). */
function normPalavras(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * A mensagem COMEÇA com algum gatilho? (usado quando a regra exige gatilho_inicio).
 * Gatilho pode ter mais de uma palavra ("me lembra"). Match no PREFIXO.
 */
export function comecaComGatilho(mensagem: string, gatilhos: string[]): boolean {
  const m = normPalavras(mensagem);
  return gatilhos.some((g) => {
    const gn = normPalavras(g);
    return gn.length > 0 && (m === gn || m.startsWith(gn + " "));
  });
}

/**
 * "sim/não" → true/false/null. null = NÃO é resposta sim/não → o chamador abandona
 * a pergunta pendente e processa a mensagem nova. Aceita a 1ª palavra ("sim, pode").
 */
export function parseSimNao(texto: string): boolean | null {
  const t = norm(texto).replace(/[.!,?]/g, "").trim();
  if (!t) return null;
  if (AFIRMA.has(t)) return true;
  if (NEGA.has(t)) return false;
  const w = t.split(/\s+/)[0];
  if (NEGA.has(w)) return false;
  if (AFIRMA.has(w)) return true;
  return null;
}

const ORDINAIS: Record<string, number> = {
  primeiro: 0, primeira: 0, "1o": 0, "1a": 0, segundo: 1, segunda: 1, "2o": 1, "2a": 1, terceiro: 2, terceira: 2, "3o": 2, "3a": 2,
};

/** Resposta → índice da opção, -1 = cancelar ("nenhuma"), null = não é seleção. */
export function parseSelecao(texto: string, opcoes: string[]): number | null | -1 {
  let t = norm(texto).replace(/[.!,?]/g, "").trim();
  if (CANCELA.has(t)) return -1;
  t = t.replace(/^(o|a)\s+/, ""); // "o primeiro" → "primeiro"
  if (t === "ultimo" || t === "ultima") return opcoes.length ? opcoes.length - 1 : null;
  if (t in ORDINAIS) { const i = ORDINAIS[t]; return i < opcoes.length ? i : null; }
  const num = t.match(/^(\d{1,2})$/);
  if (num) { const i = Number(num[1]) - 1; return i >= 0 && i < opcoes.length ? i : null; }
  const idx = opcoes.findIndex((o) => norm(o).includes(t) && t.length >= 3);
  return idx >= 0 ? idx : null;
}

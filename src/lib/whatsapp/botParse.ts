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

/**
 * Remove o prefixo-gatilho do lembrete ("lembrete", "anota", "me lembra de"…)
 * pra salvar só o CONTEÚDO. Se sobrar vazio, mantém o texto original (salvar algo).
 * Ex: "lembrete colocar o caminhão em manutenção" → "colocar o caminhão em manutenção".
 */
export function limparLembrete(texto: string): string {
  const t = (texto ?? "").trim();
  const m = t.match(/^(?:me\s+lembra(?:r)?(?:\s+de)?|lembrete|lembrar|lembra|anotar|anote|anota|nota|aviso|guarda)\b[\s:,.\-–—!]*([\s\S]*)/i);
  return m && m[1].trim() ? m[1].trim() : t;
}

const REF_GENERICA = /^(esse|este|aquele|ele|ela|mesmo|o mesmo|esse caminhao|este caminhao|o caminhao|aquele caminhao|esse veiculo|este veiculo|o veiculo)$/;
/** O "alvo" é uma referência genérica ("esse caminhão", "ele") em vez de um apelido/placa? */
export function ehReferenciaGenerica(alvo: string): boolean {
  return REF_GENERICA.test(norm(alvo).replace(/[.!,?]/g, "").trim());
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

/**
 * Detecta o status-alvo numa frase de mudança de status do veículo.
 * "põe o leão em manutenção" → 'manutencao' · "deixa o touro parado" → 'parado'
 * "põe pra rodar / libera" → 'operacional' (precisa de motorista — tratado no caller).
 * null = não deu pra saber → o caller pergunta.
 */
export function parseStatusVeiculo(texto: string): "manutencao" | "parado" | "operacional" | null {
  const t = normPalavras(texto);
  if (/\b(manutencao|oficina|mecanic\w*|conserto|revisao geral)\b/.test(t)) return "manutencao";
  if (/\b(parado|parar|encosta\w*|encostado|de circulacao|garagem)\b/.test(t)) return "parado";
  if (/\b(rodar|rodando|operacional|libera\w*|volta\w* a (rodar|operar)|ativa\w*)\b/.test(t)) return "operacional";
  return null;
}

export const STATUS_VEICULO_LABEL: Record<string, string> = {
  operacional: "🟢 Rodando",
  manutencao: "🔧 Manutenção",
  parado: "🅿️ Parado",
};

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

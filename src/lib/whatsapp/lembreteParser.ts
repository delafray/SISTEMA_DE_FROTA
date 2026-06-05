/**
 * Detecção DETERMINÍSTICA de intenção de lembrete em texto livre.
 *
 * Por quê: depender do Gemini "decidir" chamar a tool criar_lembrete é
 * não-confiável (thinking off + histórico contaminado → às vezes só responde
 * "ok" sem chamar). Esta detecção garante que as formas comuns sempre salvem,
 * na hora, sem passar pela IA. A tool do Gemini fica como reserva para frases
 * fora do padrão.
 *
 * Retorno:
 *  - string com conteúdo → salvar como lembrete
 *  - '' (string vazia)   → é lembrete mas SEM conteúdo (pedir o texto ao usuário)
 *  - null                → NÃO é lembrete (segue o fluxo normal / Gemini)
 *
 * Gatilhos UNÍVOCOS de propósito (evita falso-positivo tipo "nota fiscal"):
 *  - "lembrete" em qualquer lugar  ("lembrete: X", "cria um lembrete pra X")
 *  - "me lembra/lembre [de/que] X"
 *  - começa com "anota/anote [aí] [que] X"
 * NÃO dispara em "registra/guarda/salva/nota" (ambíguos: despesa, nota fiscal) —
 * esses ficam para a tool do Gemini desambiguar pelo contexto.
 */

function limpar(s: string): string {
  return s.replace(/^[\s:,.\-–—]+/, '').trim();
}

export function extrairLembrete(texto: string): string | null {
  const t = (texto ?? '').trim();
  if (!t) return null;

  // 1. "lembrete" presente (gatilho mais forte). Pega o conteúdo após a palavra,
  //    pulando conectores opcionais (pra/para/de/do/da/que).
  const mLembrete = t.match(/lembrete\b\s*(?:(?:pra|para|de|do|da|que)\b\s*)?(.*)/i);
  if (mLembrete) return limpar(mLembrete[1]); // pode ser '' → caller pede o texto

  // 2. "me lembra/lembre [de/do/da/que] X" — exige conteúdo
  const mMeLembra = t.match(/\bme\s+lembr[ae]\b\s*(?:(?:de|do|da|que)\b\s*)?(.*)/i);
  if (mMeLembra) {
    const c = limpar(mMeLembra[1]);
    if (c) return c;
  }

  // 3. começa com "anota/anote [aí] [que/de] X" — exige conteúdo.
  //    "aí" usa \s+ (não \b) porque o "í" acentuado não é word-char ASCII → \b falha.
  const mAnota = t.match(/^anot[ae]\b\s*(?:(?:ai|aí)\s+)?(?:(?:que|de|do|da)\b\s*)?(.*)/i);
  if (mAnota) {
    const c = limpar(mAnota[1]);
    if (c) return c;
  }

  return null;
}

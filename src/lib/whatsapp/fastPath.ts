/**
 * Fast Path — responde comandos obvios SEM chamar Gemini.
 *
 * Por que: 20-40% das mensagens sao saudacao/ajuda/sair. Cada call ao
 * Gemini custa ~500-1500 tokens (~$0.0001) + 500-1500ms de latencia.
 * Regex resolve em <1ms, custo zero.
 *
 * Cuidado: regex deve ser ESTRITO. Falso positivo = perde conversa real
 * (motorista perguntou "oi quanto km tem?" e a gente so responde "oi").
 * So matchea linhas COMPLETAS, curtas, sem mistura.
 *
 * Casos cobertos:
 *  - Saudacoes puras: "oi", "ola", "bom dia"
 *  - Pedido de ajuda/menu: "menu", "ajuda", "/help"
 *  - Encerramento: "tchau", "valeu", "obrigado" (sozinho)
 *  - Reset/comecar de novo: "/novo", "comecar de novo", "reset"
 */

import { createLogger } from '@/lib/logger';
import { limparHistorico } from './historico';

const log = createLogger('fast-path');

const TEXTO_AJUDA = (
  'Sou o assistente da Frota Delafray. Posso responder sobre:\n' +
  '• Motoristas (quantos, quem)\n' +
  '• Caminhoes (placas, apelidos, KM)\n' +
  '• Atualizar KM do hodometro\n\n' +
  'Manda a pergunta normal — texto ou audio.'
);

interface MatcherFastPath {
  /** Nome (pra log). */
  nome: string;
  /** Regex testado contra mensagem trimada + lowercase. */
  match: RegExp;
  /** Resposta — pode usar contexto (telefone, nome). */
  responder: (ctx: { telefone: string; nomeRemetente?: string }) => string | Promise<string>;
}

const MATCHERS: MatcherFastPath[] = [
  {
    nome: 'saudacao',
    match: /^(oi|ola|olá|opa|eai|e ai|hey|bom dia|boa tarde|boa noite)[\s.!?]*$/i,
    responder: ({ nomeRemetente }) => {
      const primeiroNome = nomeRemetente?.split(' ')[0];
      return primeiroNome ? `Ola, ${primeiroNome}. No que posso ajudar?` : 'Ola. No que posso ajudar?';
    },
  },
  {
    nome: 'ajuda',
    match: /^(menu|ajuda|help|\/help|\/menu|o que voce faz|o que vc faz)[\s.!?]*$/i,
    responder: () => TEXTO_AJUDA,
  },
  {
    nome: 'encerrar',
    match: /^(tchau|valeu|obrigado|obg|obrigada|brigado|ate logo|ate mais|flw)[\s.!?]*$/i,
    responder: () => 'Ate logo.',
  },
  {
    nome: 'reset',
    match: /^(\/novo|novo|comecar de novo|começar de novo|reset|\/reset|esquece tudo|limpa)[\s.!?]*$/i,
    responder: async ({ telefone }) => {
      await limparHistorico(telefone);
      return 'Conversa reiniciada. No que posso ajudar?';
    },
  },
];

export interface FastPathResultado {
  /** True se algum matcher pegou — bot deve enviar `resposta` sem chamar LLM. */
  matched: boolean;
  /** Resposta pronta pra enviar (so se matched=true). */
  resposta?: string;
  /** Nome do matcher (pra log/metricas). */
  matcher?: string;
}

/**
 * Testa a mensagem contra todos os matchers. Retorna resposta pronta ou null.
 * NUNCA lanca excecao — em qualquer erro, devolve { matched: false } e segue
 * pro Gemini.
 */
export async function tentarFastPath(
  texto: string,
  telefone: string,
  nomeRemetente?: string
): Promise<FastPathResultado> {
  if (!texto || !texto.trim()) return { matched: false };

  const normalizado = texto.trim().toLowerCase();

  // Mensagens muito longas NAO sao saudacao/ajuda — vai direto pro Gemini
  if (normalizado.length > 40) return { matched: false };

  for (const matcher of MATCHERS) {
    if (matcher.match.test(normalizado)) {
      try {
        const resposta = await matcher.responder({ telefone, nomeRemetente });
        log.info('fast_path_match', { matcher: matcher.nome, telefone, texto_len: texto.length });
        return { matched: true, resposta, matcher: matcher.nome };
      } catch (err) {
        log.error('fast_path_erro', { matcher: matcher.nome, message: (err as Error).message });
        return { matched: false };
      }
    }
  }

  return { matched: false };
}

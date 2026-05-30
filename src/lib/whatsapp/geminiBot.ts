/**
 * Gemini Bot Handler — processa mensagens pelo Gemini Flash.
 *
 * Mantém um histórico simples em memória por número de WhatsApp.
 * Essa é a fase 1: apenas conversação, sem ações no banco.
 */

import { chatGemini, type HistoricoMensagem } from '@/lib/ai/geminiClient';
import { createLogger } from '@/lib/logger';

const log = createLogger('gemini-bot');

// Histórico em memória: telefone → últimas mensagens
// Em produção futura, isso migrará para o Supabase (sessões persistentes)
const _historicos = new Map<string, HistoricoMensagem[]>();

const MAX_HISTORICO = 20; // Máximo de mensagens mantidas por conversa

function getHistorico(telefone: string): HistoricoMensagem[] {
  return _historicos.get(telefone) ?? [];
}

function adicionarAoHistorico(
  telefone: string,
  role: 'user' | 'model',
  text: string
): void {
  const historico = getHistorico(telefone);
  historico.push({ role, text });

  // Manter apenas as últimas MAX_HISTORICO mensagens
  if (historico.length > MAX_HISTORICO) {
    historico.splice(0, historico.length - MAX_HISTORICO);
  }

  _historicos.set(telefone, historico);
}

/**
 * Processa uma mensagem de texto pelo Gemini e retorna a resposta.
 * Mantém o histórico da conversa automaticamente.
 */
export async function processarComGemini(
  telefone: string,
  mensagem: string,
  nomeRemetente?: string
): Promise<string> {
  log.info('gemini_processando', { telefone, msg_len: mensagem.length });

  // Adicionar contexto do remetente se disponível
  const mensagemComContexto = nomeRemetente
    ? `[Motorista: ${nomeRemetente}] ${mensagem}`
    : mensagem;

  const historico = getHistorico(telefone);

  const resultado = await chatGemini(mensagemComContexto, historico);

  if (!resultado.ok) {
    log.error('gemini_falhou', { telefone, motivo: resultado.motivo });
    return 'Desculpe, o assistente encontrou um problema temporario. Tente novamente em instantes.';
  }

  // Salvar no histórico: mensagem original do usuário + resposta da IA
  adicionarAoHistorico(telefone, 'user', mensagem);
  adicionarAoHistorico(telefone, 'model', resultado.texto);

  log.info('gemini_respondeu', { telefone, resp_len: resultado.texto.length });
  return resultado.texto;
}

/**
 * Limpa o histórico de um número (útil ao iniciar nova sessão).
 */
export function limparHistoricoGemini(telefone: string): void {
  _historicos.delete(telefone);
  log.info('historico_limpo', { telefone });
}

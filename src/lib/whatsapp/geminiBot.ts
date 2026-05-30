/**
 * Gemini Bot Handler — processa mensagens pelo Gemini Flash.
 *
 * Mantém um histórico simples em memória por número de WhatsApp.
 * Essa é a fase 1: apenas conversação, sem ações no banco.
 */

import { chatGemini, chatGeminiComAudio, type HistoricoMensagem } from '@/lib/ai/geminiClient';
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
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string
): Promise<string> {
  log.info('gemini_processando', { telefone, msg_len: mensagem.length, com_tools: !!empresaId });

  const mensagemComContexto = nomeRemetente
    ? `[Motorista: ${nomeRemetente}] ${mensagem}`
    : mensagem;

  const historico = getHistorico(telefone);

  const resultado = await chatGemini(mensagemComContexto, historico, empresaId, motoristaId);

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
 * Pipeline áudio → Deepgram (transcrição) → Gemini (resposta).
 * O texto transcrito vai pro histórico — não mais "(mensagem de voz)" —
 * pra que o próximo turno tenha contexto real.
 */
export async function processarAudioComGemini(
  telefone: string,
  audioUrl: string,
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string
): Promise<string> {
  log.info('gemini_audio_processando', { telefone, com_tools: !!empresaId });

  const historico = getHistorico(telefone);
  const resultado = await chatGeminiComAudio(audioUrl, historico, nomeRemetente, empresaId, motoristaId);

  if (!resultado.ok) {
    log.error('gemini_audio_falhou', { telefone, motivo: resultado.motivo });
    // Mensagem diferente quando o áudio veio inaudível (silêncio, ruído)
    if (resultado.motivo === 'audio_inaudivel') {
      return 'Nao consegui entender o audio. Pode repetir, falando mais perto do microfone? Ou se preferir, escreve a mensagem.';
    }
    return 'Nao consegui processar o audio. Por favor, envie sua mensagem por escrito.';
  }

  // Salva a transcricao real (nao "(mensagem de voz)") — proxima interacao
  // tem contexto do que o motorista disse de fato
  adicionarAoHistorico(telefone, 'user', resultado.transcricao);
  adicionarAoHistorico(telefone, 'model', resultado.texto);

  log.info('gemini_audio_respondeu', {
    telefone,
    transcricao_len: resultado.transcricao.length,
    resp_len: resultado.texto.length,
  });
  return resultado.texto;
}

export function limparHistoricoGemini(telefone: string): void {
  _historicos.delete(telefone);
  log.info('historico_limpo', { telefone });
}

/**
 * Gemini Bot Handler — processa mensagens pelo Gemini Flash.
 *
 * Historico persiste em Supabase (lib/whatsapp/historico.ts) — antes era Map
 * em memoria que perdia tudo no cold start da Vercel (B1 do BOT_FRAMEWORK.md).
 */

import {
  chatGemini,
  chatGeminiComAudio,
  type HistoricoMensagem,
} from '@/lib/ai/geminiClient';
import {
  lerHistorico,
  gravarMensagem,
  limparHistorico,
} from '@/lib/whatsapp/historico';
import { createLogger } from '@/lib/logger';

const log = createLogger('gemini-bot');

/**
 * Processa uma mensagem de texto pelo Gemini e retorna a resposta.
 * Mantem o historico da conversa no Supabase.
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

  const historico: HistoricoMensagem[] = await lerHistorico(telefone);

  const resultado = await chatGemini(mensagemComContexto, historico, empresaId, motoristaId);

  if (!resultado.ok) {
    log.error('gemini_falhou', { telefone, motivo: resultado.motivo });
    return 'Desculpe, o assistente encontrou um problema temporario. Tente novamente em instantes.';
  }

  // Persistencia fire-and-forget — nao espera, nao bloqueia resposta
  void gravarMensagem(telefone, 'user', mensagem);
  void gravarMensagem(telefone, 'model', resultado.texto);

  log.info('gemini_respondeu', { telefone, resp_len: resultado.texto.length });
  return resultado.texto;
}

/**
 * Pipeline audio -> Deepgram (transcricao) -> Gemini (resposta).
 * O texto transcrito vai pro historico — proximo turno tem contexto real.
 */
export async function processarAudioComGemini(
  telefone: string,
  audioUrl: string,
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string
): Promise<string> {
  log.info('gemini_audio_processando', { telefone, com_tools: !!empresaId });

  const historico: HistoricoMensagem[] = await lerHistorico(telefone);
  const resultado = await chatGeminiComAudio(audioUrl, historico, nomeRemetente, empresaId, motoristaId);

  if (!resultado.ok) {
    log.error('gemini_audio_falhou', { telefone, motivo: resultado.motivo });
    if (resultado.motivo === 'audio_inaudivel') {
      return 'Nao consegui entender o audio. Pode repetir, falando mais perto do microfone? Ou se preferir, escreve a mensagem.';
    }
    return 'Nao consegui processar o audio. Por favor, envie sua mensagem por escrito.';
  }

  // Salva transcricao real (nao "(mensagem de voz)")
  void gravarMensagem(telefone, 'user', resultado.transcricao);
  void gravarMensagem(telefone, 'model', resultado.texto);

  log.info('gemini_audio_respondeu', {
    telefone,
    transcricao_len: resultado.transcricao.length,
    resp_len: resultado.texto.length,
  });
  return resultado.texto;
}

/**
 * Limpa todo o historico do telefone (usado em reset manual ou /novo).
 */
export async function limparHistoricoGemini(telefone: string): Promise<void> {
  await limparHistorico(telefone);
}

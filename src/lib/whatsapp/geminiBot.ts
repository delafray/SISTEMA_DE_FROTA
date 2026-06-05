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
import { prefixarComRemetente } from '@/lib/ai/contexto';
import { registrarMetrica } from '@/lib/ai/metricas';
import { createLogger } from '@/lib/logger';

const MODELO = 'gemini-2.5-flash';

const log = createLogger('gemini-bot');

/**
 * Reduz a mensagem de erro do Gemini a um CÓDIGO curto pra mostrar ao motorista
 * (o erro completo já vai pro log). Ajuda o gestor a diagnosticar pelo print do zap.
 */
function resumirErro(motivo: string): string {
  const m = (motivo || '').toLowerCase();
  if (m.includes('403') || m.includes('denied') || m.includes('permission')) return '403';
  if (m.includes('429') || m.includes('rate') || m.includes('quota') || m.includes('resource_exhausted')) return '429';
  if (m.includes('500') || m.includes('502') || m.includes('503') || m.includes('504')) return '5xx';
  if (m.includes('timeout') || m.includes('etimedout')) return 'timeout';
  if (m.includes('network') || m.includes('fetch failed') || m.includes('econnreset') || m.includes('aborted')) return 'rede';
  if (m.includes('api key') || m.includes('api_key')) return 'chave';
  return 'geral';
}

/** Aviso ao motorista quando o assistente (Gemini) está fora do ar — com o código do erro. */
function mensagemForaDoAr(ref: string): string {
  return `⚠️ Sistema fora do ar: o assistente não está atendendo as requisições no momento (erro: ${ref}). Tente novamente em instantes — se continuar, avise o gestor.`;
}

/**
 * Processa uma mensagem de texto pelo Gemini e retorna a resposta.
 * Mantem o historico da conversa no Supabase.
 */
export async function processarComGemini(
  telefone: string,
  mensagem: string,
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string,
  usuarioId?: string,
  forcarTool?: string,
  remetente?: { nome?: string; telefone?: string }
): Promise<string> {
  log.info('gemini_processando', { telefone, msg_len: mensagem.length, com_tools: !!empresaId, forcar_tool: forcarTool });

  const mensagemComContexto = prefixarComRemetente(mensagem, nomeRemetente);
  const historico: HistoricoMensagem[] = await lerHistorico(telefone);

  const inicio = Date.now();
  const resultado = await chatGemini(mensagemComContexto, historico, empresaId, motoristaId, usuarioId, forcarTool, remetente);
  const latencia = Date.now() - inicio;

  if (!resultado.ok) {
    log.error('gemini_falhou', { telefone, motivo: resultado.motivo });
    void registrarMetrica({
      telefone, empresa_id: empresaId, modo: 'gemini_texto',
      modelo: MODELO, latency_ms: latencia, sucesso: false, erro: resultado.motivo,
    });
    return mensagemForaDoAr(resumirErro(resultado.motivo));
  }

  // Persistencia SEQUENCIAL: await user antes de model garante created_at
  // monotonico. Em paralelo (void+void), Postgres podia inverter a ordem,
  // e ai a proxima chamada lia historico iniciando em 'model' → Gemini
  // rejeitava com "First content should be with role 'user', got model".
  await gravarMensagem(telefone, 'user', mensagem);
  await gravarMensagem(telefone, 'model', resultado.texto);
  void registrarMetrica({
    telefone, empresa_id: empresaId, modo: 'gemini_texto', modelo: MODELO,
    tokens_in: resultado.meta?.uso?.tokens_in,
    tokens_out: resultado.meta?.uso?.tokens_out,
    cached_tokens: resultado.meta?.uso?.cached_tokens,
    tools_chamadas: resultado.meta?.tools_chamadas,
    tool_rounds: resultado.meta?.tool_rounds,
    latency_ms: latencia, sucesso: true,
  });

  log.info('gemini_respondeu', { telefone, resp_len: resultado.texto.length, latencia_ms: latencia });
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
  motoristaId?: string,
  usuarioId?: string
): Promise<string> {
  log.info('gemini_audio_processando', { telefone, com_tools: !!empresaId });

  const historico: HistoricoMensagem[] = await lerHistorico(telefone);

  const inicio = Date.now();
  const resultado = await chatGeminiComAudio(audioUrl, historico, nomeRemetente, empresaId, motoristaId, usuarioId);
  const latencia = Date.now() - inicio;

  if (!resultado.ok) {
    log.error('gemini_audio_falhou', { telefone, motivo: resultado.motivo });
    void registrarMetrica({
      telefone, empresa_id: empresaId, modo: 'gemini_audio',
      modelo: MODELO, latency_ms: latencia, sucesso: false, erro: resultado.motivo,
    });
    if (resultado.motivo === 'audio_inaudivel') {
      return 'Nao consegui entender o audio. Pode repetir, falando mais perto do microfone? Ou se preferir, escreve a mensagem.';
    }
    return mensagemForaDoAr(resumirErro(resultado.motivo));
  }

  // Salva transcricao real (nao "(mensagem de voz)"). SEQUENCIAL — mesma
  // razao do fluxo de texto: race do Postgres invertia ordem e quebrava
  // a proxima chamada com "First content should be with role 'user'".
  await gravarMensagem(telefone, 'user', resultado.transcricao);
  await gravarMensagem(telefone, 'model', resultado.texto);
  void registrarMetrica({
    telefone, empresa_id: empresaId, modo: 'gemini_audio', modelo: MODELO,
    tokens_in: resultado.meta?.uso?.tokens_in,
    tokens_out: resultado.meta?.uso?.tokens_out,
    cached_tokens: resultado.meta?.uso?.cached_tokens,
    tools_chamadas: resultado.meta?.tools_chamadas,
    tool_rounds: resultado.meta?.tool_rounds,
    latency_ms: latencia, sucesso: true,
  });

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

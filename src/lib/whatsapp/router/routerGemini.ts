/**
 * Roteamento via Gemini — mensagem de quem está OCIOSO vai pra IA (extraído do
 * messageRouter na quebra de 22/07/2026; comportamento idêntico).
 *
 * Ordem interna: áudio transcreve primeiro (Deepgram) → lembrete determinístico
 * → Fast Path (regex, 0 token) → sinal leve de lembrete força a tool → Gemini.
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaAsBase64DataUrl } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import type { UserIdentity } from '@/lib/whatsapp/auth';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { transcreverAudio } from '@/services/aiService';
import { processarComGemini, processarAudioComGemini } from '@/lib/whatsapp/geminiBot';
import { tentarFastPath } from '@/lib/whatsapp/fastPath';
import { registrarMetrica } from '@/lib/ai/metricas';
import { tentarLembreteDeterministico, pareceLembreteLeve } from './routerLembrete';

const log = createLogger('router');

/**
 * Processa a mensagem pelo Gemini Flash.
 * Se for audio, transcreve antes de enviar.
 * Retorna sempre uma resposta em texto.
 */
export async function rotearComGemini(
  msg: ParsedMessage,
  identity: UserIdentity,
  nomeRemetente: string,
  empresaId?: string,
  motoristaId?: string
): Promise<void> {
  // usuario_id vai pro Gemini pra ferramentas que precisam saber QUEM é (ex: criar_lembrete).
  const usuarioId = ('usuario_id' in identity ? identity.usuario_id : undefined) ?? undefined;
  const nomeQuemMandou = 'nome' in identity ? identity.nome : undefined;
  const remetente = { nome: nomeQuemMandou, telefone: msg.from };

  // Áudio: WhatsApp encripta a mídia no CDN — baixar a URL HTTP direta dá bytes
  // inutilizáveis pro Deepgram. SEMPRE buscar via Evolution `getBase64FromMediaMessage`
  // (que descriptografa) e mandar como data URL pro pipeline transcrever.
  if (msg.tipo === 'audio' && msg.messageId) {
    const dataUrl = await getMediaAsBase64DataUrl(msg.messageId);
    if (!dataUrl) {
      await enviarTexto(msg.from, 'Nao foi possivel baixar o audio. Por favor, envie sua mensagem por escrito.');
      return;
    }

    // Transcreve primeiro (texto direto pro Gemini é mais rápido que reprocessar o áudio).
    const transcricao = await transcreverAudio(dataUrl);
    if (transcricao.ok && transcricao.data.texto) {
      const texto = transcricao.data.texto.trim();
      // Lembrete por áudio → salva determinístico (gatilho exato), não passa pela IA.
      // Reusa o helper de módulo com uma msg sintética carregando a transcrição.
      if (await tentarLembreteDeterministico({ ...msg, tipo: 'texto', texto }, identity, empresaId)) return;
      // Sinal LEVE de lembrete (guarda/registra/salva/não esquece) → força a tool via ANY.
      const forcar = pareceLembreteLeve(texto) ? 'criar_lembrete' : undefined;
      const resposta = await processarComGemini(msg.from, texto, nomeRemetente, empresaId, motoristaId, usuarioId, forcar, remetente);
      await enviarTexto(msg.from, resposta);
      return;
    }

    // Transcrição falhou — tenta com o pipeline completo de áudio do Gemini
    const resposta = await processarAudioComGemini(msg.from, dataUrl, nomeRemetente, empresaId, motoristaId, usuarioId);
    await enviarTexto(msg.from, resposta);
    return;
  }

  // Texto: fluxo normal. (Lembrete por gatilho exato já foi tratado no topo de
  // processarMensagem — aqui só chegam mensagens que NÃO casaram com o parser.)
  const textoParaGemini = msg.texto ?? '';
  if (!textoParaGemini) {
    await enviarTexto(msg.from, 'Nao consegui entender a mensagem. Por favor, envie um texto.');
    return;
  }

  // Fast Path: regex pra comandos obvios (saudacao, ajuda, /novo).
  // Resolve sem chamar Gemini = 0 tokens, <1ms latencia.
  const inicioFp = Date.now();
  const fp = await tentarFastPath(textoParaGemini, msg.from, nomeRemetente);
  if (fp.matched && fp.resposta) {
    await enviarTexto(msg.from, fp.resposta);
    void registrarMetrica({
      telefone: msg.from,
      empresa_id: empresaId,
      modo: 'fast_path',
      fast_path_matcher: fp.matcher,
      latency_ms: Date.now() - inicioFp,
      sucesso: true,
    });
    return;
  }

  // Sinal LEVE de lembrete (não casou no parser exato, mas tem intenção de guardar:
  // "guarda esse dado", "registra que...", "salva aí", "não esquece de..."). Aqui
  // FORÇAMOS a tool via mode ANY (forcarTool) — mais confiável que torcer pro AUTO
  // chamar sozinho. A tool persiste e o modelo confirma em texto.
  const forcar = pareceLembreteLeve(textoParaGemini) ? 'criar_lembrete' : undefined;
  if (forcar) log.info('lembrete_leve_forcando_tool', { from: msg.from });

  const resposta = await processarComGemini(
    msg.from, textoParaGemini, nomeRemetente, empresaId, motoristaId, usuarioId, forcar, remetente
  );
  await enviarTexto(msg.from, resposta);
}

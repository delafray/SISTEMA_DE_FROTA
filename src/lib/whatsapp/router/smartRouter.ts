/**
 * Smart Intent Router — mídia/texto solto SEM fluxo ativo (extraído do
 * messageRouter na quebra de 22/07/2026; comportamento idêntico).
 *
 * Classifica foto (Gemini Vision), áudio (Deepgram → texto) e texto livre
 * (intent classifier) e roteia pro flow correto. Abaixo da confiança mínima,
 * cai no menu determinístico.
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import { updateSession, type Sessao } from '@/lib/whatsapp/sessionManager';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import {
  classificarMidia,
  classificarIntentTexto,
  transcreverAudio,
} from '@/services/aiService';
import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';
import { processarAbastecimentoFlow } from '@/lib/whatsapp/flows/abastecimentoFlow';
import { processarAdiantamentoFlow } from '@/lib/whatsapp/flows/adiantamentoFlow';
import { processarDespesaFlow } from '@/lib/whatsapp/flows/despesaFlow';
import { processarImprevistoFlow } from '@/lib/whatsapp/flows/imprevistoFlow';
import { enviarMenuMotorista, enviarStatusVeiculo } from './menuMotorista';

const log = createLogger('router');

export const SMART_ROUTER_CONFIANCA_MINIMA = 60;

/**
 * Classifica uma foto solta (sem fluxo ativo) e roteia para o flow correto.
 */
export async function smartRouterFoto(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (!msg.mediaId) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    log.warn('smart_foto_sem_url', { msg_id: msg.messageId });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  await enviarTexto(msg.from, '🤖 Analisando sua foto...');
  const resultado = await classificarMidia(mediaUrl);

  if (!resultado.ok) {
    log.warn('smart_foto_classificacao_falhou', { motivo: resultado.motivo });
    await enviarTexto(msg.from, 'Não consegui entender a foto. Use o menu:');
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const { tipo, confianca } = resultado.data;
  log.info('smart_foto_classificada', { tipo, confianca });

  if (confianca < SMART_ROUTER_CONFIANCA_MINIMA) {
    await enviarTexto(msg.from, `Não tenho certeza do que é essa foto (confiança ${confianca}%). Use o menu:`);
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  switch (tipo) {
    case 'painel':
      await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
      await processarKmFlow(msg, { ...sessao, estado: 'aguardando_foto_km' });
      return;

    case 'bomba_combustivel':
    case 'cupom_combustivel':
      await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
      await processarAbastecimentoFlow(msg, { ...sessao, estado: 'aguardando_foto_abastecimento' });
      return;

    case 'cupom_generico':
      await updateSession(sessao.id, { estado: 'aguardando_despesa_foto' });
      await processarDespesaFlow(msg, { ...sessao, estado: 'aguardando_despesa_foto' });
      return;

    case 'avaria':
      await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
      await processarAvariaFlow(msg, { ...sessao, estado: 'aguardando_avaria_midia' });
      return;

    case 'documento':
    case 'documento_pedido_frete':
      await enviarTexto(
        msg.from,
        '📄 Recebi um documento. Por enquanto só o gestor processa documentos pelo painel web.'
      );
      await enviarMenuMotorista(msg.from, sessao);
      return;

    default:
      await enviarTexto(msg.from, 'Não reconheci o tipo da foto. Use o menu:');
      await enviarMenuMotorista(msg.from, sessao);
      return;
  }
}

/**
 * Transcreve áudio e roteia pelo intent identificado.
 */
export async function smartRouterAudio(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (!msg.mediaId) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    log.warn('smart_audio_sem_url', { msg_id: msg.messageId });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  await enviarTexto(msg.from, '🎧 Escutando seu áudio...');
  const transcricao = await transcreverAudio(mediaUrl);

  if (!transcricao.ok) {
    log.warn('smart_audio_transcricao_falhou', { motivo: transcricao.motivo });
    await enviarTexto(msg.from, 'Não consegui entender o áudio. Use o menu:');
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  log.info('smart_audio_transcrito', { texto_len: transcricao.data.texto.length });

  // Áudio costuma ser relato de avaria/imprevisto. Trata como texto.
  await smartRouterTexto(
    { ...msg, tipo: 'texto', texto: transcricao.data.texto },
    sessao,
    { textoAdicional: '🎧 Entendi o áudio como: ' }
  );
}

/**
 * Classifica intenção de texto livre e roteia.
 */
export async function smartRouterTexto(
  msg: ParsedMessage,
  sessao: Sessao,
  opts?: { textoAdicional?: string }
): Promise<void> {
  if (!msg.texto) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const resultado = await classificarIntentTexto(msg.texto, 'motorista');

  if (!resultado.ok) {
    log.warn('smart_texto_classificacao_falhou', { motivo: resultado.motivo });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const { intent, confianca } = resultado.data;
  log.info('smart_texto_classificado', { intent, confianca });

  if (confianca < SMART_ROUTER_CONFIANCA_MINIMA || intent === 'fallback' || intent === 'saudacao') {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  if (opts?.textoAdicional) {
    await enviarTexto(msg.from, `${opts.textoAdicional}_${msg.texto}_`);
  }

  switch (intent) {
    case 'km':
      await enviarTexto(msg.from, 'Ótimo! Tire uma foto clara do painel mostrando o odômetro. 📷');
      await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
      return;

    case 'abastecimento':
      await enviarTexto(msg.from, '📸 Tire uma foto do comprovante de abastecimento.');
      await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
      return;

    case 'avaria':
      await enviarTexto(msg.from, 'Me conte o que aconteceu.\nPode mandar *foto*, *áudio* ou *texto*. 🔍');
      // Se já veio com texto descritivo, repassa para o avariaFlow processar
      if (msg.texto.length > 15) {
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
        await processarAvariaFlow(msg, { ...sessao, estado: 'aguardando_avaria_midia' });
      } else {
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
      }
      return;

    case 'despesa':
      await processarDespesaFlow(msg, sessao, true);
      return;

    case 'adiantamento':
      await processarAdiantamentoFlow(msg, sessao, true);
      return;

    case 'imprevisto':
      await processarImprevistoFlow(msg, sessao, true);
      return;

    case 'viagem_iniciar':
    case 'pedido_iniciar':
      await enviarTexto(msg.from, 'Para onde vai? Digite a *origem* e o *destino*\n(ex: São Paulo → Campinas)');
      await updateSession(sessao.id, { estado: 'aguardando_origem_destino' });
      return;

    case 'viagem_encerrar':
    case 'pedido_encerrar':
      await enviarTexto(msg.from, 'Pra encerrar o pedido, abra o painel web ou peça pro gestor finalizar.');
      await enviarMenuMotorista(msg.from, sessao);
      return;

    case 'status':
      await enviarStatusVeiculo(msg.from, sessao);
      return;

    case 'documentos':
      await enviarTexto(msg.from, '📄 Módulo de documentos em desenvolvimento.\nFale com o gestor para acessar seus documentos.');
      return;

    default:
      await enviarMenuMotorista(msg.from, sessao);
      return;
  }
}

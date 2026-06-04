/**
 * WhatsApp Webhook Route Handler — Next.js App Router.
 *
 * POST: Recebe mensagens dos usuários via Evolution API em tempo real.
 *
 * Diferente da Meta Cloud API, a Evolution API NÃO usa um GET de verificação
 * de challenge — só envia POSTs. A autenticação é feita via header `apikey`.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { parseWebhookPayload, type EvolutionWebhookPayload } from '@/lib/whatsapp/messageParser';
import { marcarComoLida } from '@/lib/whatsapp/messageSender';
import { processarMensagem } from '@/lib/whatsapp/messageRouter';
import { verifyEvolutionSignature } from '@/lib/whatsapp/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook');

// Pina a função na região São Paulo — reduz latência BR (Supabase + Gemini)
export const preferredRegion = 'gru1';

// ─── POST: Receber mensagens ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  log.info('post_received');

  try {
    const rawBody = await request.text();
    const apiKeyHeader = request.headers.get('apikey');
    const verification = verifyEvolutionSignature(apiKeyHeader);

    if (!verification.ok) {
      log.warn('signature_invalid', { reason: verification.reason });
      return new Response('Unauthorized', { status: 401 });
    }
    if (verification.mode === 'skipped-no-secret') {
      log.warn('signature_skipped', { reason: 'EVOLUTION_WEBHOOK_SECRET not set' });
    }

    const body = JSON.parse(rawBody) as EvolutionWebhookPayload;
    log.info('payload_event', { event: body.event, instance: body.instance });

    // Ignorar eventos que não sejam mensagens recebidas
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ok', skipped: true });
    }

    // Log diagnóstico: dump dos campos key.* para entender o formato do JID
    // (descobrir @lid, senderPn etc enviados pela Evolution v2.3 + Baileys novo)
    const dataItems = Array.isArray(body.data) ? body.data : [body.data];
    for (const item of dataItems) {
      if (item?.key && item.key.fromMe !== true) {
        log.info('key_fields', { key: item.key });
      }
    }

    const messages = parseWebhookPayload(body);
    log.info('payload_parsed', { messages_count: messages.length });

    if (messages.length === 0) {
      return NextResponse.json({ status: 'ok' });
    }

    await Promise.all(messages.map((msg) => processarMensagemAsync(msg)));
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    Sentry.captureException(err, { tags: { scope: 'whatsapp_webhook' } });
    log.error('post_error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

// ─── PROCESSAMENTO ASSÍNCRONO ────────────────────────────────────────

async function processarMensagemAsync(msg: Awaited<ReturnType<typeof parseWebhookPayload>>[number]) {
  const ctx = { msg_id: msg.messageId, from: msg.from, tipo: msg.tipo };
  try {
    log.info('message_received', ctx);
    await marcarComoLida(msg.messageId);
    await processarMensagem(msg);
    log.info('message_processed', ctx);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { scope: 'whatsapp_message' },
      extra: ctx,
    });
    log.error('message_failed', {
      ...ctx,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

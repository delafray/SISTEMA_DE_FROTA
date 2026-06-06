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

// Pina na região US East — mais perto do Evolution API, Deepgram e Gemini (todos US)
// Supabase (BR) perde ~150ms nas queries pequenas, trade-off favorável
export const preferredRegion = 'iad1';

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

    // R15: valida o envelope antes do cast (não confiar em `as`). Schema estrito
    // seria arriscado (Evolution varia o payload por evento) — guard mínimo: é objeto?
    const raw: unknown = JSON.parse(rawBody);
    if (!raw || typeof raw !== 'object') {
      log.warn('payload_nao_objeto');
      return NextResponse.json({ status: 'ok', skipped: true });
    }
    const body = raw as EvolutionWebhookPayload;
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
    // Marca como lida em PARALELO (fire-and-forget): é uma chamada ao Evolution
    // que pode levar até 3s e NÃO precisa bloquear a resposta ao motorista.
    // marcarComoLida já trata o próprio erro internamente (nunca lança), então
    // dispensar o await é seguro — tira esse tempo do caminho crítico de toda msg.
    void marcarComoLida(msg.messageId);
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

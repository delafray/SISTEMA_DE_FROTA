/**
 * WhatsApp Webhook Route Handler — Next.js App Router.
 *
 * GET:  Verificação do webhook pela Meta (challenge).
 * POST: Recebe mensagens dos usuários em tempo real.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { parseWebhookPayload, type WebhookPayload } from '@/lib/whatsapp/messageParser';
import { marcarComoLida } from '@/lib/whatsapp/messageSender';
import { processarMensagem } from '@/lib/whatsapp/messageRouter';
import { verifyMetaSignature } from '@/lib/whatsapp/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook');

// ─── GET: Verificação do webhook ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = (searchParams.get('hub.verify_token') ?? '').trim();
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '').trim();

  log.info('verify_get', {
    mode,
    token_len: token.length,
    expected_len: verifyToken.length,
    match: token === verifyToken,
  });

  if (mode === 'subscribe' && token === verifyToken) {
    log.info('verify_success');
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  log.warn('verify_failed', { reason: 'token_mismatch' });
  return new Response('Forbidden', { status: 403 });
}

// ─── POST: Receber mensagens ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  log.info('post_received');

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const verification = verifyMetaSignature(rawBody, signature);

    if (!verification.ok) {
      log.warn('signature_invalid', { reason: verification.reason });
      return new Response('Invalid signature', { status: 401 });
    }
    if (verification.mode === 'skipped-no-secret') {
      log.warn('signature_skipped', { reason: 'META_APP_SECRET not set' });
    }

    const body = JSON.parse(rawBody) as WebhookPayload;
    const messages = parseWebhookPayload(body);
    log.info('payload_parsed', { messages_count: messages.length });

    // Extrai status updates da Meta (sent/delivered/read/failed)
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value?.statuses ?? []) {
          const errors = (st as { errors?: Array<{ code: number; title: string; message?: string }> }).errors;
          const level = st.status === 'failed' ? 'error' : 'info';
          log[level]('status_update', {
            wamid: st.id,
            status: st.status,
            recipient: st.recipient_id,
            errors: errors ?? null,
          });
        }
      }
    }

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

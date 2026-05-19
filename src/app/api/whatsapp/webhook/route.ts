/**
 * WhatsApp Webhook Route Handler — Next.js App Router.
 *
 * GET:  Verificação do webhook pela Meta (challenge).
 * POST: Recebe mensagens dos usuários em tempo real.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseWebhookPayload, type WebhookPayload } from '@/lib/whatsapp/messageParser';
import { marcarComoLida } from '@/lib/whatsapp/messageSender';
import { processarMensagem } from '@/lib/whatsapp/messageRouter';

// ─── GET: Verificação do webhook ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = (searchParams.get('hub.verify_token') ?? '').trim();
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '').trim();

  console.log('[webhook] GET recebido:', {
    mode,
    tokenLen: token.length,
    tokenPreview: token.slice(0, 15),
    verifyTokenLen: verifyToken.length,
    verifyTokenPreview: verifyToken.slice(0, 15),
    match: token === verifyToken,
    challenge,
  });

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[webhook] ✅ Verificação do webhook bem-sucedida');
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[webhook] ❌ Verificação falhou — token inválido');
  return new Response('Forbidden', { status: 403 });
}

// ─── POST: Receber mensagens ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebhookPayload;

    // A Meta espera resposta 200 IMEDIATAMENTE (< 5s).
    // Processamos a mensagem de forma assíncrona.
    const messages = parseWebhookPayload(body);

    if (messages.length === 0) {
      // Pode ser status update (delivered, read) — ignorar
      return NextResponse.json({ status: 'ok' });
    }

    // Processar cada mensagem em background
    for (const msg of messages) {
      // Fire-and-forget: não bloquear a resposta ao webhook
      processarMensagemAsync(msg).catch((err) => {
        console.error('[webhook] Erro ao processar mensagem:', err);
      });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook] Erro ao processar payload:', err);
    // Sempre retornar 200 para a Meta não ficar reenviando
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

// ─── PROCESSAMENTO ASSÍNCRONO ────────────────────────────────────────

async function processarMensagemAsync(msg: Awaited<ReturnType<typeof parseWebhookPayload>>[number]) {
  try {
    console.log(`[webhook] 📩 Mensagem de ${msg.from} (${msg.fromName}): tipo=${msg.tipo}`);

    // 1. Marcar como lida (double blue check)
    await marcarComoLida(msg.messageId);

    // 2. Processar a mensagem (router principal)
    await processarMensagem(msg);

    console.log(`[webhook] ✅ Mensagem ${msg.messageId} processada`);
  } catch (err) {
    console.error(`[webhook] ❌ Erro ao processar mensagem ${msg.messageId}:`, err);
    // Não relançar — o motorista não deve travar
  }
}

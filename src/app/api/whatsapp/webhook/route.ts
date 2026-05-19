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
  console.log('[webhook] 🔔 POST recebido', new Date().toISOString());

  try {
    const body = (await request.json()) as WebhookPayload;
    console.log('[webhook] 📦 Payload:', JSON.stringify(body));

    const messages = parseWebhookPayload(body);
    console.log(`[webhook] ➡️  ${messages.length} mensagem(ns) extraída(s)`);

    if (messages.length === 0) {
      return NextResponse.json({ status: 'ok' });
    }

    // Aguarda processamento dentro da janela de 5s da Meta para que
    // os logs sejam drenados antes de o container serverless encerrar.
    await Promise.all(messages.map((msg) => processarMensagemAsync(msg)));

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[webhook] Erro ao processar payload:', err);
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

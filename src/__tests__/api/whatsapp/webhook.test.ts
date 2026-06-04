/**
 * Teste do webhook do WhatsApp — foco no fire-and-forget do "marcar como lida".
 * marcarComoLida é uma chamada ao Evolution (até 3s) que NÃO pode bloquear o
 * processamento da mensagem. Mockamos as folhas (parser, router, sender, security).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/whatsapp/security', () => ({
  verifyEvolutionSignature: vi.fn(() => ({ ok: true, mode: 'verified' })),
}));
vi.mock('@/lib/whatsapp/messageParser', () => ({
  parseWebhookPayload: vi.fn(),
}));
vi.mock('@/lib/whatsapp/messageRouter', () => ({
  processarMensagem: vi.fn(),
}));
vi.mock('@/lib/whatsapp/messageSender', () => ({
  marcarComoLida: vi.fn(),
}));

import { POST } from '@/app/api/whatsapp/webhook/route';
import { parseWebhookPayload } from '@/lib/whatsapp/messageParser';
import { processarMensagem } from '@/lib/whatsapp/messageRouter';
import { marcarComoLida } from '@/lib/whatsapp/messageSender';

const PAYLOAD = { event: 'messages.upsert', instance: 'i', data: [] };
const MSG = { messageId: 'm1', from: '5531999', tipo: 'texto' };

function makeReq(body: object) {
  return {
    text: async () => JSON.stringify(body),
    headers: { get: () => 'fake-key' },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (parseWebhookPayload as ReturnType<typeof vi.fn>).mockReturnValue([MSG]);
  (processarMensagem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('webhook POST — marcar como lida não bloqueia', () => {
  it('marcarComoLida é fire-and-forget: mesmo travada, processa a msg e responde 200', async () => {
    // marcarComoLida NUNCA resolve — se fosse `await`, o handler travaria (timeout).
    (marcarComoLida as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const res = await POST(makeReq(PAYLOAD));

    expect(marcarComoLida).toHaveBeenCalledWith('m1'); // ainda é chamado…
    expect(processarMensagem).toHaveBeenCalledWith(MSG); // …mas não bloqueia o processamento
    expect(res.status).toBe(200);
  });

  it('fluxo normal: marca como lida + processa + 200', async () => {
    (marcarComoLida as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const res = await POST(makeReq(PAYLOAD));

    expect(processarMensagem).toHaveBeenCalledWith(MSG);
    expect(res.status).toBe(200);
  });

  it('evento que não é mensagem → ignora sem processar', async () => {
    const res = await POST(makeReq({ event: 'connection.update', instance: 'i', data: [] }));

    expect(processarMensagem).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

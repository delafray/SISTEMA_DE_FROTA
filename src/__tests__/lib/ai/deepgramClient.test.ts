/**
 * Testes do cliente Deepgram — transcrição STT.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcreverComDeepgram } from '@/lib/ai/deepgramClient';

const fetchOriginal = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEEPGRAM_API_KEY = 'test-key';
});

afterEach(() => {
  global.fetch = fetchOriginal;
});

describe('transcreverComDeepgram', () => {
  it('sucesso: baixa áudio + chama Deepgram + extrai transcript', async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchMock = vi.fn()
      // 1ª chamada: download do áudio da Evolution API
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'audio/ogg' },
        arrayBuffer: async () => audioBytes,
      } as unknown as Response)
      // 2ª chamada: POST pro Deepgram
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            channels: [{ alternatives: [{ transcript: 'Bom dia, quero registrar.' }] }],
          },
        }),
      } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    const res = await transcreverComDeepgram('https://api/audio.ogg');

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe('Bom dia, quero registrar.');
    // Validou que enviou pro Deepgram com Authorization e o áudio
    const segundaChamada = fetchMock.mock.calls[1];
    expect(segundaChamada[0]).toContain('api.deepgram.com/v1/listen');
    expect(segundaChamada[0]).toContain('model=nova-2');
    expect(segundaChamada[0]).toContain('language=pt-BR');
    const init = segundaChamada[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token test-key');
  });

  it('sem API key → retorna erro sem chamar APIs', async () => {
    delete process.env.DEEPGRAM_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toContain('DEEPGRAM_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha download da Evolution API → erro', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response) as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toContain('404');
  });

  it('Deepgram retorna erro HTTP → propaga motivo', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'audio/ogg' },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'invalid key',
      } as unknown as Response) as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('401');
      expect(res.motivo).toContain('invalid key');
    }
  });

  it('Deepgram retorna JSON sem transcript → texto vazio (ok=true)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'audio/ogg' },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: { channels: [] } }),
      } as unknown as Response) as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe('');
  });

  it('exceção de rede → captura e retorna como erro', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toBe('network down');
  });
});

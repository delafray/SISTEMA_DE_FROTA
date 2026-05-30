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

  it('aceita data URL com parametro codecs (real do Evolution API: audio/ogg; codecs=opus)', async () => {
    // Bug real reportado em producao: Evolution API retorna
    // "data:audio/ogg; codecs=opus;base64,XXX" — com parametro extra
    // antes do ;base64,. Meu regex antigo (/^data:([^;]+);base64,/)
    // falhava porque so aceitava UM ;.
    const ogg = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00]);
    const dataUrl = `data:audio/ogg; codecs=opus;base64,${ogg.toString('base64')}`;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { channels: [{ alternatives: [{ transcript: 'ola' }] }] },
      }),
    } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    const res = await transcreverComDeepgram(dataUrl);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe('ola');
    // Content-Type enviado pro Deepgram: 'audio/ogg' (limpo via magic OggS)
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/ogg');
  });

  it('aceita data URL (base64) sem fazer fetch', async () => {
    // Audio: "OggS" + bytes
    const ogg = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00]);
    const dataUrl = `data:audio/ogg;base64,${ogg.toString('base64')}`;
    // So o segundo fetch (Deepgram) deve ocorrer — fetch da Evolution NAO
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { channels: [{ alternatives: [{ transcript: 'oi' }] }] },
      }),
    } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    const res = await transcreverComDeepgram(dataUrl);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.texto).toBe('oi');
    // Apenas 1 fetch (Deepgram), nao 2
    expect(fetchMock).toHaveBeenCalledOnce();
    // Validar Content-Type: 'audio/ogg' (vindo do data URL)
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/ogg');
  });

  it('exceção de rede → captura e retorna como erro', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const res = await transcreverComDeepgram('https://audio');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toBe('network down');
  });
});

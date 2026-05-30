/**
 * Testes do processarAudioComGemini — fluxo completo + grava transcrição no histórico.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chatGemini + chatGeminiComAudio antes de importar
const chatGeminiComAudioMock = vi.fn();
const chatGeminiMock = vi.fn();
vi.mock('@/lib/ai/geminiClient', () => ({
  chatGemini: (m: string, h: unknown) => chatGeminiMock(m, h),
  chatGeminiComAudio: (url: string, h: unknown, nome?: string) =>
    chatGeminiComAudioMock(url, h, nome),
}));

import { processarAudioComGemini, limparHistoricoGemini } from '@/lib/whatsapp/geminiBot';

beforeEach(() => {
  vi.clearAllMocks();
  limparHistoricoGemini('+5511999999999');
});

describe('processarAudioComGemini', () => {
  it('sucesso: retorna resposta do Gemini', async () => {
    chatGeminiComAudioMock.mockResolvedValue({
      ok: true,
      texto: 'Funcionalidade ainda em configuração.',
      transcricao: 'Quero registrar 50 km',
    });

    const resp = await processarAudioComGemini('+5511999999999', 'https://audio', 'João');

    expect(resp).toBe('Funcionalidade ainda em configuração.');
    expect(chatGeminiComAudioMock).toHaveBeenCalledWith('https://audio', [], 'João');
  });

  it('salva TRANSCRIÇÃO real no histórico (não "(mensagem de voz)")', async () => {
    // Capturamos snapshot do historico no momento de CADA chamada — sem isso
    // mock.calls[N][1] daria a referencia ja mutada pelas chamadas seguintes
    const snapshots: Array<unknown[]> = [];
    chatGeminiComAudioMock.mockImplementation((_url, historico) => {
      snapshots.push([...(historico as unknown[])]);
      // Devolve transcricao diferente por chamada (via call count)
      return snapshots.length === 1
        ? Promise.resolve({ ok: true, texto: 'Confirmado.', transcricao: 'Bom dia, registra 100 km hoje' })
        : Promise.resolve({ ok: true, texto: 'OK.', transcricao: 'segunda mensagem' });
    });

    await processarAudioComGemini('+5511999999999', 'https://audio1', 'Carlos');
    await processarAudioComGemini('+5511999999999', 'https://audio2', 'Carlos');

    // 1ª chamada: historico vazio (era a primeira)
    expect(snapshots[0]).toEqual([]);
    // 2ª chamada: historico deve ter a TRANSCRICAO real (nao "(mensagem de voz)")
    expect(snapshots[1]).toEqual([
      { role: 'user', text: 'Bom dia, registra 100 km hoje' },
      { role: 'model', text: 'Confirmado.' },
    ]);
  });

  it('áudio inaudível → mensagem específica pedindo pra repetir', async () => {
    chatGeminiComAudioMock.mockResolvedValue({
      ok: false,
      motivo: 'audio_inaudivel',
    });

    const resp = await processarAudioComGemini('+5511999999999', 'https://audio');

    expect(resp).toContain('Nao consegui entender o audio');
    expect(resp).toContain('repetir');
  });

  it('erro genérico (rede, API) → mensagem padrão pedindo pra escrever', async () => {
    chatGeminiComAudioMock.mockResolvedValue({
      ok: false,
      motivo: 'transcricao_falhou: 500 internal',
    });

    const resp = await processarAudioComGemini('+5511999999999', 'https://audio');

    expect(resp).toContain('Nao consegui processar');
    expect(resp).toContain('escrito');
  });

  it('NÃO grava no histórico quando o áudio falha', async () => {
    chatGeminiComAudioMock.mockResolvedValueOnce({ ok: false, motivo: 'audio_inaudivel' });

    await processarAudioComGemini('+5511999999999', 'https://audio1');

    // Próximo áudio: histórico deve estar vazio (falha não grava)
    chatGeminiComAudioMock.mockResolvedValueOnce({
      ok: true,
      texto: 'OK',
      transcricao: 'mensagem nova',
    });
    await processarAudioComGemini('+5511999999999', 'https://audio2');

    const segundaChamada = chatGeminiComAudioMock.mock.calls[1];
    expect(segundaChamada[1]).toEqual([]); // histórico vazio
  });
});

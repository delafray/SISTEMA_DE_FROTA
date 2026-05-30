/**
 * Testes do processarAudioComGemini + processarComGemini.
 * Historico persiste via Supabase (lib/whatsapp/historico) — mockado aqui.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garante mocks antes do vi.mock (que e hoisted)
const mocks = vi.hoisted(() => ({
  chatGemini: vi.fn(),
  chatGeminiComAudio: vi.fn(),
  lerHistorico: vi.fn(),
  gravarMensagem: vi.fn(),
  limparHistorico: vi.fn(),
}));

vi.mock('@/lib/ai/geminiClient', () => ({
  chatGemini: mocks.chatGemini,
  chatGeminiComAudio: mocks.chatGeminiComAudio,
}));

vi.mock('@/lib/whatsapp/historico', () => ({
  lerHistorico: mocks.lerHistorico,
  gravarMensagem: mocks.gravarMensagem,
  limparHistorico: mocks.limparHistorico,
}));

import {
  processarComGemini,
  processarAudioComGemini,
  limparHistoricoGemini,
} from '@/lib/whatsapp/geminiBot';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lerHistorico.mockResolvedValue([]);
  mocks.gravarMensagem.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('processarComGemini — texto', () => {
  it('sucesso: chama chatGemini com historico do Supabase + grava resposta', async () => {
    mocks.lerHistorico.mockResolvedValue([
      { role: 'user', text: 'oi' },
      { role: 'model', text: 'ola' },
    ]);
    mocks.chatGemini.mockResolvedValue({ ok: true, texto: 'Funcionalidade ja existe.' });

    const r = await processarComGemini('+5511999999999', 'quanto km tem?', 'Carlos', 'emp-1', 'mot-1');

    expect(r).toBe('Funcionalidade ja existe.');
    expect(mocks.lerHistorico).toHaveBeenCalledWith('+5511999999999');
    expect(mocks.chatGemini).toHaveBeenCalledWith(
      '[Motorista: Carlos] quanto km tem?',
      [
        { role: 'user', text: 'oi' },
        { role: 'model', text: 'ola' },
      ],
      'emp-1',
      'mot-1'
    );
    // Grava user + model (fire-and-forget)
    expect(mocks.gravarMensagem).toHaveBeenCalledWith('+5511999999999', 'user', 'quanto km tem?');
    expect(mocks.gravarMensagem).toHaveBeenCalledWith('+5511999999999', 'model', 'Funcionalidade ja existe.');
  });

  it('Gemini falha → mensagem amigavel, NAO grava no historico', async () => {
    mocks.chatGemini.mockResolvedValue({ ok: false, motivo: 'rate limit' });

    const r = await processarComGemini('+5511999999999', 'oi');

    expect(r).toContain('problema temporario');
    expect(mocks.gravarMensagem).not.toHaveBeenCalled();
  });

  it('sem nome do remetente: nao prefixa com [Motorista: ...]', async () => {
    mocks.chatGemini.mockResolvedValue({ ok: true, texto: 'ok' });

    await processarComGemini('+5511999999999', 'mensagem nua');

    expect(mocks.chatGemini).toHaveBeenCalledWith('mensagem nua', [], undefined, undefined);
  });
});

describe('processarAudioComGemini — audio', () => {
  it('sucesso: grava transcricao real (nao "(mensagem de voz)")', async () => {
    mocks.chatGeminiComAudio.mockResolvedValue({
      ok: true,
      texto: 'Confirmado.',
      transcricao: 'meu km e 45000',
    });

    await processarAudioComGemini('+5511999999999', 'https://audio', 'Carlos', 'emp-1', 'mot-1');

    expect(mocks.gravarMensagem).toHaveBeenCalledWith('+5511999999999', 'user', 'meu km e 45000');
    expect(mocks.gravarMensagem).toHaveBeenCalledWith('+5511999999999', 'model', 'Confirmado.');
  });

  it('audio inaudivel → mensagem especifica pedindo pra repetir', async () => {
    mocks.chatGeminiComAudio.mockResolvedValue({ ok: false, motivo: 'audio_inaudivel' });

    const r = await processarAudioComGemini('+5511999999999', 'https://audio');

    expect(r).toContain('Nao consegui entender');
    expect(r).toContain('repetir');
    expect(mocks.gravarMensagem).not.toHaveBeenCalled();
  });

  it('erro generico → pede pra escrever', async () => {
    mocks.chatGeminiComAudio.mockResolvedValue({ ok: false, motivo: 'transcricao_falhou: HTTP 500' });

    const r = await processarAudioComGemini('+5511999999999', 'https://audio');

    expect(r).toContain('Nao consegui processar');
    expect(r).toContain('escrito');
  });
});

describe('limparHistoricoGemini', () => {
  it('delega pra limparHistorico do supabase', async () => {
    await limparHistoricoGemini('+5511999999999');
    expect(mocks.limparHistorico).toHaveBeenCalledWith('+5511999999999');
  });
});

/**
 * Testes da função chatGeminiComAudio — pipeline Deepgram → Gemini text.
 *
 * Cobertura:
 * - Sucesso: áudio transcreve, Gemini responde, retorna texto + transcrição
 * - Erro Deepgram (falha na API)
 * - Áudio inaudível (transcrição vazia)
 * - Erro Gemini text (depois da transcrição OK)
 * - Prefixo de nome do remetente é aplicado
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks compartilhados — vi.hoisted garante existencia antes do vi.mock
const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  transcrever: vi.fn(),
}));

vi.mock('@google/generative-ai', () => {
  // Class mock — constructor sempre devolve a instancia, sem problemas de vi.fn() + new
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        startChat: () => ({ sendMessage: mocks.sendMessage }),
      };
    }
  }
  return { GoogleGenerativeAI };
});

vi.mock('@/lib/ai/deepgramClient', () => ({
  transcreverComDeepgram: mocks.transcrever,
}));

import { chatGeminiComAudio } from '@/lib/ai/geminiClient';

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.transcrever.mockReset();
  process.env.GEMINI_API_KEY = 'test-key';
});

describe('chatGeminiComAudio — pipeline Deepgram → Gemini', () => {
  it('sucesso: áudio transcreve → Gemini responde → retorna texto + transcrição', async () => {
    mocks.transcrever.mockResolvedValue({
      ok: true,
      texto: 'Quero registrar 50 quilometros',
    });
    mocks.sendMessage.mockResolvedValue({
      response: { text: () => 'Funcionalidade ainda em configuração.' },
    });

    const res = await chatGeminiComAudio('https://api/audio.ogg', []);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.texto).toBe('Funcionalidade ainda em configuração.');
      expect(res.transcricao).toBe('Quero registrar 50 quilometros');
    }
    expect(mocks.transcrever).toHaveBeenCalledWith('https://api/audio.ogg');
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });

  it('prefixa nome do remetente quando fornecido', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'Bom dia' });
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'Bom dia.' } });

    await chatGeminiComAudio('https://audio', [], 'João');

    expect(mocks.sendMessage).toHaveBeenCalledWith('[Motorista: João] Bom dia');
  });

  it('SEM prefixo quando não há nomeRemetente', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'Boa tarde' });
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'Boa tarde.' } });

    await chatGeminiComAudio('https://audio', []);

    expect(mocks.sendMessage).toHaveBeenCalledWith('Boa tarde');
  });

  it('manda texto pro Gemini (com historico ja propagado via chatGemini)', async () => {
    // Como o pipeline reusa chatGemini, o teste valida que a mensagem final
    // enviada ao sendMessage e o texto transcrito (+prefixo se houver).
    // Historico vai via chatGemini.startChat — testado em outro nivel.
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'continua a conversa' });
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'Resposta.' } });

    const historico = [
      { role: 'user' as const, text: 'oi' },
      { role: 'model' as const, text: 'olá' },
    ];
    const res = await chatGeminiComAudio('https://audio', historico);

    expect(res.ok).toBe(true);
    expect(mocks.sendMessage).toHaveBeenCalledWith('continua a conversa');
  });

  it('falha Deepgram → retorna erro transcricao_falhou', async () => {
    mocks.transcrever.mockResolvedValue({
      ok: false,
      motivo: 'DEEPGRAM_API_KEY não configurada',
    });

    const res = await chatGeminiComAudio('https://audio', []);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toContain('transcricao_falhou');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('áudio inaudível (transcript vazio) → retorna audio_inaudivel', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: '' });

    const res = await chatGeminiComAudio('https://audio', []);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toBe('audio_inaudivel');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('Gemini falha (depois da transcrição OK) → propaga motivo', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'oi' });
    mocks.sendMessage.mockRejectedValue(new Error('rate limit'));

    const res = await chatGeminiComAudio('https://audio', []);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toBe('rate limit');
  });
});

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
  getGenerativeModel: vi.fn(),
  startChat: vi.fn(),
}));

vi.mock('@google/generative-ai', () => {
  // Class mock — constructor sempre devolve a instancia, sem problemas de vi.fn() + new
  class GoogleGenerativeAI {
    getGenerativeModel(params: unknown) {
      mocks.getGenerativeModel(params); // captura pra inspecionar generationConfig
      return {
        startChat: (startParams: unknown) => {
          mocks.startChat(startParams); // captura toolConfig por chamada de startChat
          return {
            sendMessage: mocks.sendMessage,
            getHistory: async () => [],
          };
        },
      };
    }
  }
  // SchemaType e FunctionDeclaration sao usados em frotaTools — precisam existir
  // no mock pra import nao quebrar.
  return {
    GoogleGenerativeAI,
    FunctionCallingMode: { MODE_UNSPECIFIED: 'MODE_UNSPECIFIED', AUTO: 'AUTO', ANY: 'ANY', NONE: 'NONE' },
    SchemaType: {
      OBJECT: 'object',
      STRING: 'string',
      NUMBER: 'number',
      BOOLEAN: 'boolean',
      ARRAY: 'array',
    },
  };
});

vi.mock('@/lib/ai/deepgramClient', () => ({
  transcreverComDeepgram: mocks.transcrever,
}));

import { chatGemini, chatGeminiComAudio } from '@/lib/ai/geminiClient';

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.transcrever.mockReset();
  mocks.getGenerativeModel.mockReset();
  mocks.startChat.mockReset();
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

describe('chatGemini — config de latência', () => {
  it('thinkingBudget baixo (>0) + temperature 0 + limita tokens', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'oi' });
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'ok' } });

    await chatGeminiComAudio('https://audio', []); // reusa chatGemini internamente

    const params = mocks.getGenerativeModel.mock.calls[0][0] as {
      generationConfig?: { thinkingConfig?: { thinkingBudget?: number }; maxOutputTokens?: number; temperature?: number };
    };
    // thinking NÃO totalmente off (degradava a decisão de chamar tool), mas baixo p/ latência.
    expect(params.generationConfig?.thinkingConfig?.thinkingBudget).toBeGreaterThan(0);
    expect(params.generationConfig?.thinkingConfig?.thinkingBudget).toBeLessThanOrEqual(512);
    expect(params.generationConfig?.temperature).toBe(0);
    expect(params.generationConfig?.maxOutputTokens).toBeGreaterThan(0);
  });

  it('system prompt é VIRGEM: regra única = criar_lembrete, sem outras regras', async () => {
    mocks.transcrever.mockResolvedValue({ ok: true, texto: 'oi' });
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'ok' } });

    await chatGeminiComAudio('https://audio', []);

    const params = mocks.getGenerativeModel.mock.calls[0][0] as { systemInstruction?: string };
    const prompt = params.systemInstruction ?? '';
    expect(prompt).not.toMatch(/em breve/i);
    expect(prompt).toMatch(/criar_lembrete/i);
    // IA virgem: NÃO deve mencionar tools/regras antigas removidas.
    expect(prompt).not.toMatch(/listar_motoristas|listar_veiculos|propor_atualizacao_km|buscar_km/i);
  });
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

describe('chatGemini — forcarTool (mode ANY na 1a rodada)', () => {
  it('forcarTool="criar_lembrete" → 1o startChat tem toolConfig ANY restrito; 2o startChat (loop) SEM toolConfig', async () => {
    // 1a resposta sem functionCall (mock simples) → o loop encerra rápido.
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'Anotado.' } });

    const res = await chatGemini('anota aí algo', [], 'emp-1', undefined, 'usr-1', 'criar_lembrete');

    expect(res.ok).toBe(true);

    // 1o startChat: toolConfig ANY com allowedFunctionNames = ['criar_lembrete']
    const primeiro = mocks.startChat.mock.calls[0][0] as {
      toolConfig?: { functionCallingConfig?: { mode?: string; allowedFunctionNames?: string[] } };
    };
    expect(primeiro.toolConfig?.functionCallingConfig?.mode).toBe('ANY');
    expect(primeiro.toolConfig?.functionCallingConfig?.allowedFunctionNames).toEqual(['criar_lembrete']);

    // 2o startChat (reabertura p/ loop em AUTO): SEM toolConfig (evita loop infinito)
    const segundo = mocks.startChat.mock.calls[1]?.[0] as { toolConfig?: unknown } | undefined;
    expect(segundo).toBeDefined();
    expect(segundo?.toolConfig).toBeUndefined();
  });

  it('SEM forcarTool → startChat NÃO tem toolConfig (modo AUTO normal)', async () => {
    mocks.sendMessage.mockResolvedValue({ response: { text: () => 'ok' } });

    await chatGemini('quantos motoristas?', [], 'emp-1');

    const primeiro = mocks.startChat.mock.calls[0][0] as { toolConfig?: unknown };
    expect(primeiro.toolConfig).toBeUndefined();
    // Só um startChat (não reabre sessão quando não força)
    expect(mocks.startChat).toHaveBeenCalledOnce();
  });
});

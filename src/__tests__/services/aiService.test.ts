import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── MOCK do openaiClient ─────────────────────────────────────────────
// Precisa vir ANTES do import do aiService (vi.mock é hoisted automaticamente).
vi.mock('@/lib/ai/openaiClient', () => ({
  chatCompletion: vi.fn(),
  whisperTranscription: vi.fn(),
}));

import { chatCompletion, whisperTranscription } from '@/lib/ai/openaiClient';
import {
  lerOdometro,
  lerCupomAbastecimento,
  lerCupomGenerico,
  analisarAvaria,
  transcreverAudio,
  classificarMidia,
  extrairPedidoFrete,
  classificarIntentTexto,
} from '@/services/aiService';

const chatCompletionMock = vi.mocked(chatCompletion);
const whisperTranscriptionMock = vi.mocked(whisperTranscription);

const USAGE_FAKE = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };

function mockChatOk(content: string) {
  chatCompletionMock.mockResolvedValueOnce({
    ok: true,
    content,
    usage: USAGE_FAKE,
  });
}

function mockChatFail(code = 'rate_limit', error = 'too many requests') {
  chatCompletionMock.mockResolvedValueOnce({
    ok: false,
    error,
    code,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── lerOdometro ──────────────────────────────────────────────────────

describe('lerOdometro', () => {
  it('sucesso: retorna data parseada quando JSON é válido', async () => {
    mockChatOk(JSON.stringify({ km: 185000, confianca: 95, observacao: 'ok' }));

    const res = await lerOdometro('https://x.com/foto.jpg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ km: 185000, confianca: 95, observacao: 'ok' });
      expect(res.usage).toEqual(USAGE_FAKE);
    }

    expect(chatCompletionMock).toHaveBeenCalledOnce();
    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    expect(args.response_format).toEqual({ type: 'json_object' });
    expect(args.messages).toHaveLength(2);
    expect(args.messages[0].role).toBe('system');
    expect(args.messages[1].role).toBe('user');
    // Mensagem user deve conter o image_url
    const userContent = args.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    if (Array.isArray(userContent)) {
      const imgPart = userContent.find((p) => p.type === 'image_url');
      expect(imgPart?.image_url?.url).toBe('https://x.com/foto.jpg');
    }
  });

  it('falha do openaiClient: retorna fallbackManual com o code no motivo', async () => {
    mockChatFail('rate_limit', 'too many requests');

    const res = await lerOdometro('https://x.com/foto.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fallbackManual).toBe(true);
      expect(res.motivo).toContain('rate_limit');
    }
  });

  it('JSON malformado: retorna fallbackManual com motivo de JSON inválido', async () => {
    mockChatOk('isso { não é } json');

    const res = await lerOdometro('https://x.com/foto.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fallbackManual).toBe(true);
      expect(res.motivo).toMatch(/JSON/i);
    }
  });

  it('resposta sem campo km ou confianca: retorna formato inválido', async () => {
    mockChatOk(JSON.stringify({ observacao: 'só isso' }));

    const res = await lerOdometro('https://x.com/foto.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fallbackManual).toBe(true);
      expect(res.motivo).toMatch(/formato inválido/i);
    }
  });

  it('resposta com km mas sem confianca: retorna formato inválido', async () => {
    mockChatOk(JSON.stringify({ km: 100000, observacao: 'sem confianca' }));

    const res = await lerOdometro('https://x.com/foto.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/formato inválido/i);
    }
  });
});

// ─── lerCupomAbastecimento ────────────────────────────────────────────

describe('lerCupomAbastecimento', () => {
  it('sucesso: parseia e retorna data', async () => {
    const fakeData = {
      litros: 45.32,
      valor_total: 387.5,
      valor_litro: 8.55,
      posto: 'Shell',
      data: '2025-05-19',
      confianca: 90,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await lerCupomAbastecimento('https://x.com/c.jpg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
      expect(res.usage).toEqual(USAGE_FAKE);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    expect(args.response_format).toEqual({ type: 'json_object' });
  });

  it('falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('server_error', 'oops');

    const res = await lerCupomAbastecimento('https://x.com/c.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('server_error');
    }
  });

  it('JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('not-json-at-all');

    const res = await lerCupomAbastecimento('https://x.com/c.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

// ─── lerCupomGenerico ─────────────────────────────────────────────────

describe('lerCupomGenerico', () => {
  it('sucesso: parseia e retorna data', async () => {
    const fakeData = {
      tipo: 'pedagio',
      valor: 15.5,
      local: 'CCR Praça XYZ',
      data: '2025-05-19',
      descricao: 'pedágio',
      confianca: 88,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await lerCupomGenerico('https://x.com/g.jpg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    expect(args.response_format).toEqual({ type: 'json_object' });
  });

  it('falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('auth_error', 'unauthorized');

    const res = await lerCupomGenerico('https://x.com/g.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('auth_error');
    }
  });

  it('JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('<<bad>>');

    const res = await lerCupomGenerico('https://x.com/g.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

// ─── analisarAvaria ───────────────────────────────────────────────────

describe('analisarAvaria', () => {
  it('tipo=texto: chama chatCompletion com gpt-4o e retorna data', async () => {
    const fakeData = {
      descricao: 'pneu murcho',
      urgencia: 'alta',
      recomendacao: 'parar e calibrar',
      confianca: 85,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await analisarAvaria({ tipo: 'texto', texto: 'meu pneu está murcho' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    expect(chatCompletionMock).toHaveBeenCalledOnce();
    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o');
    expect(args.response_format).toEqual({ type: 'json_object' });
    // texto: messages[1].content é string
    expect(typeof args.messages[1].content).toBe('string');
  });

  it('tipo=foto: chama chatCompletion com gpt-4o e image_url', async () => {
    const fakeData = {
      descricao: 'arranhão na lateral',
      urgencia: 'baixa',
      recomendacao: 'pode rodar',
      confianca: 70,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await analisarAvaria({ tipo: 'foto', url: 'https://x.com/avaria.jpg' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o');
    const userContent = args.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    if (Array.isArray(userContent)) {
      const imgPart = userContent.find((p) => p.type === 'image_url');
      expect(imgPart?.image_url?.url).toBe('https://x.com/avaria.jpg');
    }
  });

  it('tipo=audio: transcreve primeiro e re-chama analisarAvaria como texto', async () => {
    whisperTranscriptionMock.mockResolvedValueOnce({
      ok: true,
      text: 'meu freio está fazendo barulho',
    });

    const fakeData = {
      descricao: 'freio com ruído',
      urgencia: 'alta',
      recomendacao: 'levar à oficina',
      confianca: 80,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await analisarAvaria({ tipo: 'audio', url: 'https://x.com/a.ogg' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    // whisper foi chamado com a URL
    expect(whisperTranscriptionMock).toHaveBeenCalledOnce();
    const [whisperArgs] = whisperTranscriptionMock.mock.calls[0];
    expect(whisperArgs.audioUrl).toBe('https://x.com/a.ogg');
    expect(whisperArgs.language).toBe('pt');

    // chatCompletion foi chamado uma vez (re-chamada como texto)
    expect(chatCompletionMock).toHaveBeenCalledOnce();
    const [chatArgs] = chatCompletionMock.mock.calls[0];
    expect(chatArgs.model).toBe('gpt-4o');
    // messages[1].content é string com o texto transcrito embedded
    expect(typeof chatArgs.messages[1].content).toBe('string');
    expect(chatArgs.messages[1].content as string).toContain(
      'meu freio está fazendo barulho'
    );
  });

  it('tipo=audio com transcrição falhando: retorna fallbackManual', async () => {
    whisperTranscriptionMock.mockResolvedValueOnce({
      ok: false,
      error: 'falha no download',
      code: 'download_error',
    });

    const res = await analisarAvaria({ tipo: 'audio', url: 'https://x.com/a.ogg' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/transcrever/i);
    }
    // chatCompletion não deve ser chamado
    expect(chatCompletionMock).not.toHaveBeenCalled();
  });

  it('parâmetros inválidos (sem url e sem texto): retorna fallbackManual', async () => {
    const res = await analisarAvaria({ tipo: 'foto' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/parâmetros inválidos/i);
    }
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(whisperTranscriptionMock).not.toHaveBeenCalled();
  });

  it('tipo=foto com falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('server_error', 'oops');

    const res = await analisarAvaria({ tipo: 'foto', url: 'https://x.com/a.jpg' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('server_error');
    }
  });

  it('tipo=texto com JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('lixo não-json');

    const res = await analisarAvaria({ tipo: 'texto', texto: 'algo' });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

// ─── transcreverAudio ─────────────────────────────────────────────────

describe('transcreverAudio', () => {
  it('sucesso: retorna texto transcrito', async () => {
    whisperTranscriptionMock.mockResolvedValueOnce({
      ok: true,
      text: 'olá, tudo bem?',
    });

    const res = await transcreverAudio('https://x.com/a.ogg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.texto).toBe('olá, tudo bem?');
    }

    expect(whisperTranscriptionMock).toHaveBeenCalledOnce();
    const [args] = whisperTranscriptionMock.mock.calls[0];
    expect(args.audioUrl).toBe('https://x.com/a.ogg');
    expect(args.language).toBe('pt');
  });

  it('falha do whisperTranscription: retorna fallbackManual', async () => {
    whisperTranscriptionMock.mockResolvedValueOnce({
      ok: false,
      error: 'timeout',
      code: 'timeout',
    });

    const res = await transcreverAudio('https://x.com/a.ogg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('timeout');
    }
  });
});

// ─── classificarMidia ─────────────────────────────────────────────────

describe('classificarMidia', () => {
  it('sucesso: parseia e retorna data', async () => {
    const fakeData = {
      tipo: 'painel',
      confianca: 92,
      observacao: 'odômetro visível',
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await classificarMidia('https://x.com/f.jpg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    expect(args.response_format).toEqual({ type: 'json_object' });
    const userContent = args.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    if (Array.isArray(userContent)) {
      const imgPart = userContent.find((p) => p.type === 'image_url');
      expect(imgPart?.image_url?.url).toBe('https://x.com/f.jpg');
    }
  });

  it('falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('network_error', 'oops');

    const res = await classificarMidia('https://x.com/f.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('network_error');
    }
  });

  it('JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('}}}{{{');

    const res = await classificarMidia('https://x.com/f.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

// ─── extrairPedidoFrete ───────────────────────────────────────────────

describe('extrairPedidoFrete', () => {
  it('sucesso: parseia e retorna data', async () => {
    const fakeData = {
      cliente_nome: 'Empresa X',
      cliente_cnpj: '12345678000199',
      origem: 'São Paulo - SP',
      destino: 'Belo Horizonte - MG',
      valor_pedido: 5000,
      peso_carga_kg: 15000,
      tipo_carga: 'carga seca',
      data_coleta: '2025-05-20',
      data_entrega: '2025-05-21',
      observacoes: null,
      confianca: 88,
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await extrairPedidoFrete('https://x.com/pedido.jpg');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o');
    expect(args.max_tokens).toBe(1500);
    expect(args.response_format).toEqual({ type: 'json_object' });
  });

  it('falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('billing_error', 'no credits');

    const res = await extrairPedidoFrete('https://x.com/p.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('billing_error');
    }
  });

  it('JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('completely invalid');

    const res = await extrairPedidoFrete('https://x.com/p.jpg');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

// ─── classificarIntentTexto ───────────────────────────────────────────

describe('classificarIntentTexto', () => {
  it('role=motorista: usa prompt de motorista e retorna intent', async () => {
    const fakeData = { intent: 'adiantamento', confianca: 90 };
    mockChatOk(JSON.stringify(fakeData));

    const res = await classificarIntentTexto('preciso de 200 reais', 'motorista');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    expect(chatCompletionMock).toHaveBeenCalledOnce();
    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    expect(args.response_format).toEqual({ type: 'json_object' });

    // System deve ser o prompt de MOTORISTA (contém referências ao motorista)
    const systemContent = args.messages[0].content as string;
    expect(systemContent).toMatch(/MOTORISTA/i);
    // User content embute o texto
    const userContent = args.messages[1].content as string;
    expect(userContent).toContain('preciso de 200 reais');
  });

  it('role=gestor: usa prompt diferente (gestor)', async () => {
    const fakeData = {
      intent: 'consulta_lucro_mensal',
      confianca: 95,
      parametros: { motorista_nome: null, veiculo_placa: null, periodo: 'mês' },
    };
    mockChatOk(JSON.stringify(fakeData));

    const res = await classificarIntentTexto('qual o lucro do mês?', 'gestor');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(fakeData);
    }

    const [args] = chatCompletionMock.mock.calls[0];
    expect(args.model).toBe('gpt-4o-mini');
    const systemContent = args.messages[0].content as string;
    expect(systemContent).toMatch(/GESTOR/i);
    const userContent = args.messages[1].content as string;
    expect(userContent).toContain('qual o lucro do mês?');
  });

  it('falha do openaiClient: retorna fallbackManual', async () => {
    mockChatFail('rate_limit', 'too many');

    const res = await classificarIntentTexto('texto qualquer', 'motorista');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toContain('rate_limit');
    }
  });

  it('JSON malformado: retorna fallbackManual', async () => {
    mockChatOk('isto não é json válido');

    const res = await classificarIntentTexto('texto qualquer', 'motorista');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.motivo).toMatch(/JSON/i);
    }
  });
});

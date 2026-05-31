/**
 * Testes do historico persistente do bot WhatsApp.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { lerHistorico, gravarMensagem, limparHistorico } from '@/lib/whatsapp/historico';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function setupSelect(returnData: Array<{ role: string; texto: string; created_at: string }>, error: { message: string } | null = null) {
  // B22: lerHistorico encadeia .order TWICE (created_at, depois id pra desempate).
  // Mock devolve chainable .order que so termina em .limit.
  const orderChain: Record<string, unknown> = {};
  orderChain.order = vi.fn(() => orderChain);
  orderChain.limit = vi.fn(() => Promise.resolve({ data: returnData, error }));
  supabaseFromMock.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => orderChain),
    })),
  });
}

describe('lerHistorico', () => {
  it('retorna mensagens em ordem ASC (mais antiga primeiro)', async () => {
    const agora = new Date().toISOString();
    setupSelect([
      { role: 'model', texto: 'segunda resposta', created_at: agora },
      { role: 'user', texto: 'segunda msg', created_at: agora },
      { role: 'model', texto: 'primeira resposta', created_at: agora },
      { role: 'user', texto: 'primeira msg', created_at: agora },
    ]);

    const hist = await lerHistorico('+5511999999999');

    expect(hist).toEqual([
      { role: 'user', text: 'primeira msg' },
      { role: 'model', text: 'primeira resposta' },
      { role: 'user', text: 'segunda msg' },
      { role: 'model', text: 'segunda resposta' },
    ]);
  });

  it('reset automatico apos 30min de inatividade', async () => {
    const horaAtras = new Date(Date.now() - 31 * 60_000).toISOString();
    setupSelect([
      { role: 'model', texto: 'velho', created_at: horaAtras },
    ]);

    const hist = await lerHistorico('+5511999999999');

    expect(hist).toEqual([]);
  });

  it('Supabase retorna erro → historico vazio (fallback gracioso)', async () => {
    setupSelect([], { message: 'table not found' });

    const hist = await lerHistorico('+5511999999999');

    expect(hist).toEqual([]);
  });

  it('sem mensagens → array vazio', async () => {
    setupSelect([]);
    const hist = await lerHistorico('+5511999999999');
    expect(hist).toEqual([]);
  });

  it('janela cortando turno: descarta msgs model do INICIO (Gemini exige user primeiro)', async () => {
    // Cenario real: janela MAX_MENSAGENS=8 corta um turno user/model no meio.
    // Banco devolve (DESC): model, user, model, user, model, user, model, MODEL_ORFAO
    // Apos reverse: MODEL_ORFAO, user, model, user, model, user, model, user
    // Defesa deve descartar o MODEL_ORFAO inicial.
    const agora = new Date().toISOString();
    setupSelect([
      { role: 'model', texto: '8', created_at: agora },
      { role: 'user', texto: '7', created_at: agora },
      { role: 'model', texto: '6', created_at: agora },
      { role: 'user', texto: '5', created_at: agora },
      { role: 'model', texto: '4', created_at: agora },
      { role: 'user', texto: '3', created_at: agora },
      { role: 'model', texto: '2', created_at: agora },
      { role: 'model', texto: 'MODEL_ORFAO', created_at: agora },
    ]);

    const hist = await lerHistorico('+5511999999999');

    expect(hist[0].role).toBe('user');
    // Verifica que NAO comeca com 'model'
    expect(hist.every((m, i) => i > 0 || m.role === 'user')).toBe(true);
  });

  it('race condition: primeiro evento e model (created_at invertido) → descarta', async () => {
    // Race do Postgres na gravacao paralela: model insertou antes do user
    // do MESMO turno. Banco DESC: [model_resp, user_pergunta] → reverse:
    // [user_pergunta, model_resp]. OK quando esse e o unico turno. Mas se
    // veio um turno antes com a mesma race, e a janela so pegou esse
    // model orfao do turno anterior, ele lidera e quebra Gemini.
    const agora = new Date().toISOString();
    setupSelect([
      { role: 'user', texto: 'pergunta atual', created_at: agora },
      { role: 'model', texto: 'resposta_orfa_turno_anterior', created_at: agora },
    ]);

    const hist = await lerHistorico('+5511999999999');

    // Reverse: [model_orfa, user_pergunta] → defesa descarta o model
    expect(hist).toEqual([{ role: 'user', text: 'pergunta atual' }]);
  });
});

describe('gravarMensagem', () => {
  it('insere mensagem com role + texto', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    supabaseFromMock.mockReturnValue({ insert: insertMock });

    await gravarMensagem('+5511999999999', 'user', 'oi');

    expect(insertMock).toHaveBeenCalledWith({
      telefone: '+5511999999999',
      role: 'user',
      texto: 'oi',
      metadata: null,
    });
  });

  it('texto vazio → NAO grava', async () => {
    const insertMock = vi.fn();
    supabaseFromMock.mockReturnValue({ insert: insertMock });

    await gravarMensagem('+5511999999999', 'user', '');
    await gravarMensagem('+5511999999999', 'user', '   ');

    expect(insertMock).not.toHaveBeenCalled();
  });

  it('erro de DB → loga mas NAO lanca excecao', async () => {
    supabaseFromMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'fail' } }),
    });
    await expect(gravarMensagem('+5511999999999', 'user', 'oi')).resolves.toBeUndefined();
  });
});

describe('limparHistorico', () => {
  it('deleta todas as mensagens do telefone', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn(() => ({ eq: deleteEq }));
    supabaseFromMock.mockReturnValue({ delete: deleteMock });

    await limparHistorico('+5511999999999');

    expect(deleteMock).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith('telefone', '+5511999999999');
  });
});

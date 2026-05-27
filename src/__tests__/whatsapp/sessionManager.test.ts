import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── ENV (sessionManager lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no top-level) ────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-test';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import {
  getOrCreateSession,
  updateSession,
  resetToMenu,
  limparSessoesExpiradas,
} from '@/lib/whatsapp/sessionManager';

// ─── HELPERS ────────────────────────────────────────────────────────────

/**
 * Helper para construir um mock do builder do supabase de forma fluente.
 * Retorna um objeto onde cada método encadeado retorna `self`, exceto
 * os terminadores (maybeSingle, single, then no caso de select sem terminador)
 * que retornam o valor configurado.
 */
type Result = { data: unknown; error: unknown };

function makeBuilder(opts: {
  maybeSingle?: Result;
  single?: Result;
  /** Para .delete().lt().select() — last call is awaitable */
  selectThenable?: Result;
  /** Para .update().eq() — last call is awaitable */
  updateThenable?: Result;
}) {
  // captura das chamadas
  const calls = {
    select: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };

  // builder com encadeamento
  const builder: Record<string, unknown> = {};

  builder.select = vi.fn((...args: unknown[]) => {
    calls.select(...args);
    return builder;
  });
  builder.insert = vi.fn((...args: unknown[]) => {
    calls.insert(...args);
    return builder;
  });
  builder.upsert = vi.fn((...args: unknown[]) => {
    calls.upsert(...args);
    return builder;
  });
  builder.update = vi.fn((...args: unknown[]) => {
    calls.update(...args);
    // o update final é "awaitable" — vira thenable que resolve em updateThenable
    const thenable: Record<string, unknown> = {};
    thenable.eq = vi.fn((...a: unknown[]) => {
      calls.eq(...a);
      return Promise.resolve(opts.updateThenable ?? { data: null, error: null });
    });
    return thenable;
  });
  builder.delete = vi.fn((...args: unknown[]) => {
    calls.delete(...args);
    return builder;
  });
  builder.eq = vi.fn((...args: unknown[]) => {
    calls.eq(...args);
    return builder;
  });
  builder.gt = vi.fn((...args: unknown[]) => {
    calls.gt(...args);
    return builder;
  });
  builder.lt = vi.fn((...args: unknown[]) => {
    calls.lt(...args);
    return builder;
  });
  builder.order = vi.fn((...args: unknown[]) => {
    calls.order(...args);
    return builder;
  });
  builder.limit = vi.fn((...args: unknown[]) => {
    calls.limit(...args);
    return builder;
  });
  builder.maybeSingle = vi.fn(() => {
    calls.maybeSingle();
    return Promise.resolve(opts.maybeSingle ?? { data: null, error: null });
  });
  builder.single = vi.fn(() => {
    calls.single();
    return Promise.resolve(opts.single ?? { data: null, error: null });
  });

  // Tornar o builder em si "thenable" para o caso .delete().lt().select() awaited
  // (delete chain termina com .select('id') e é awaited)
  builder.then = (resolve: (r: Result) => unknown) =>
    resolve(opts.selectThenable ?? { data: null, error: null });

  return { builder, calls };
}

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('sessionManager.getOrCreateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sessão existente (< 24h) → renova ultimo_contato e NÃO insere', async () => {
    const existingSession = {
      id: 'sess-existing',
      whatsapp: '5531999',
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      estado: 'aguardando_acao',
      contexto: { veiculo_id: 'v-1' },
      ultimo_contato: new Date().toISOString(),
    };

    // Cada chamada a supabase.from() retorna um builder novo.
    // 1ª: select (maybeSingle) — devolve a sessão existente
    // 2ª: update — renova ultimo_contato
    const selectB = makeBuilder({
      maybeSingle: { data: existingSession, error: null },
    });
    const updateB = makeBuilder({
      updateThenable: { data: null, error: null },
    });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(updateB.builder);

    const result = await getOrCreateSession({
      whatsapp: '5531999',
      motorista_id: 'mot-1',
      usuario_id: 'usr-1',
      empresa_id: 'emp-1',
    });

    expect(result.id).toBe('sess-existing');
    expect(result.estado).toBe('aguardando_acao');
    expect(result.contexto).toEqual({ veiculo_id: 'v-1' });
    expect(result.usuario_id).toBe('usr-1');

    // O update do ultimo_contato foi chamado
    expect(updateB.calls.update).toHaveBeenCalledTimes(1);
    const updatePayload = updateB.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toHaveProperty('ultimo_contato');
    expect(updateB.calls.eq).toHaveBeenCalledWith('id', 'sess-existing');

    // NÃO chamou upsert (nem o insert legado)
    expect(selectB.calls.upsert).not.toHaveBeenCalled();
    expect(updateB.calls.upsert).not.toHaveBeenCalled();
    expect(selectB.calls.insert).not.toHaveBeenCalled();
    expect(updateB.calls.insert).not.toHaveBeenCalled();
  });

  it('nova sessão → upsert SEM usuario_id e retorna usuario_id do parâmetro', async () => {
    // 1ª chamada: select — não encontra
    const selectB = makeBuilder({ maybeSingle: { data: null, error: null } });

    // 2ª chamada: upsert — retorna nova sessão (sem usuario_id, conforme schema)
    const insertedSession = {
      id: 'sess-new',
      whatsapp: '5531999',
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      estado: 'novo',
      contexto: {},
      ultimo_contato: new Date().toISOString(),
    };
    const upsertB = makeBuilder({ single: { data: insertedSession, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(upsertB.builder);

    const result = await getOrCreateSession({
      whatsapp: '5531999',
      motorista_id: 'mot-1',
      usuario_id: 'usr-1',
      empresa_id: 'emp-1',
    });

    // upsert foi chamado COM motorista_id/empresa_id/estado/contexto, SEM usuario_id
    expect(upsertB.calls.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = upsertB.calls.upsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    const upsertPayload = upsertCall[0];
    const upsertOptions = upsertCall[1];
    expect(upsertPayload.motorista_id).toBe('mot-1');
    expect(upsertPayload.empresa_id).toBe('emp-1');
    expect(upsertPayload.estado).toBe('novo');
    expect(upsertPayload.contexto).toEqual({});
    expect(upsertPayload.whatsapp).toBe('5531999');
    expect(upsertPayload).not.toHaveProperty('usuario_id');
    expect(upsertOptions).toEqual({ onConflict: 'whatsapp' });

    // O retorno carrega usuario_id vindo do parâmetro
    expect(result.id).toBe('sess-new');
    expect(result.usuario_id).toBe('usr-1');
    expect(result.motorista_id).toBe('mot-1');
  });

  it('upsert falha → retorna sessão temporária (id começa com "temp-") e loga upsert_failed', async () => {
    const selectB = makeBuilder({ maybeSingle: { data: null, error: null } });
    const upsertB = makeBuilder({
      single: {
        data: null,
        error: { code: 'PGRST204', message: 'Could not find column', details: '...' },
      },
    });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(upsertB.builder);

    const consoleErrorSpy = vi.spyOn(console, 'error');

    const result = await getOrCreateSession({
      whatsapp: '5531999',
      motorista_id: 'mot-1',
      usuario_id: 'usr-1',
      empresa_id: 'emp-1',
    });

    expect(result.id.startsWith('temp-')).toBe(true);
    expect(result.estado).toBe('novo');
    expect(result.motorista_id).toBe('mot-1');
    expect(result.usuario_id).toBe('usr-1');
    expect(result.empresa_id).toBe('emp-1');

    // logger.error → console.error em ambiente não-prod
    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((line) => line.includes('upsert_failed'))).toBe(true);
  });

  it('sem motorista (gestor) → upsert com motorista_id: null', async () => {
    const selectB = makeBuilder({ maybeSingle: { data: null, error: null } });
    const insertedSession = {
      id: 'sess-gestor',
      whatsapp: '5531999',
      motorista_id: null,
      empresa_id: 'emp-1',
      estado: 'novo',
      contexto: {},
      ultimo_contato: new Date().toISOString(),
    };
    const upsertB = makeBuilder({ single: { data: insertedSession, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(upsertB.builder);

    const result = await getOrCreateSession({
      whatsapp: '5531999',
      motorista_id: null,
      usuario_id: 'gestor-id',
      empresa_id: 'emp-1',
    });

    expect(upsertB.calls.upsert).toHaveBeenCalledTimes(1);
    const upsertPayload = upsertB.calls.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertPayload.motorista_id).toBeNull();
    expect(upsertPayload).not.toHaveProperty('usuario_id');

    expect(result.motorista_id).toBeNull();
    expect(result.usuario_id).toBe('gestor-id');
  });

  it('sessão expirada (linha já existe mas > 24h) → upsert reaproveita reseta para novo', async () => {
    // 1ª: select com filtro de 24h retorna null (sessão antiga não conta como ativa)
    const selectB = makeBuilder({ maybeSingle: { data: null, error: null } });

    // 2ª: upsert resolve o conflito UNIQUE em whatsapp, devolvendo a linha
    //     reescrita com estado='novo' e contexto={} (comportamento esperado do bug fix).
    const resetSession = {
      id: 'sess-reused',
      whatsapp: '553189791317',
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      estado: 'novo',
      contexto: {},
      ultimo_contato: new Date().toISOString(),
    };
    const upsertB = makeBuilder({ single: { data: resetSession, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(upsertB.builder);

    const result = await getOrCreateSession({
      whatsapp: '553189791317',
      motorista_id: 'mot-1',
      usuario_id: 'usr-1',
      empresa_id: 'emp-1',
    });

    // Confirma que o onConflict foi setado — esse é o pulo do gato do fix.
    const upsertOptions = upsertB.calls.upsert.mock.calls[0][1] as { onConflict: string };
    expect(upsertOptions).toEqual({ onConflict: 'whatsapp' });
    expect(result.id).toBe('sess-reused');
    expect(result.estado).toBe('novo');
  });
});

describe('sessionManager.updateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('apenas estado → update sem tocar em contexto', async () => {
    const updateB = makeBuilder({ updateThenable: { data: null, error: null } });
    supabaseFromMock.mockReturnValueOnce(updateB.builder);

    await updateSession('sess-1', { estado: 'aguardando_foto_km' });

    expect(updateB.calls.update).toHaveBeenCalledTimes(1);
    const payload = updateB.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.estado).toBe('aguardando_foto_km');
    expect(payload).toHaveProperty('ultimo_contato');
    expect(payload).not.toHaveProperty('contexto');
    expect(updateB.calls.eq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('apenas contexto → merge com o contexto atual', async () => {
    // 1ª: select para buscar contexto atual
    const selectB = makeBuilder({
      single: {
        data: { contexto: { veiculo_id: 'v1', km_lido: 100 } },
        error: null,
      },
    });
    // 2ª: update
    const updateB = makeBuilder({ updateThenable: { data: null, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(updateB.builder);

    await updateSession('sess-1', { contexto: { foto_url: 'x' } });

    expect(updateB.calls.update).toHaveBeenCalledTimes(1);
    const payload = updateB.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.contexto).toEqual({ veiculo_id: 'v1', km_lido: 100, foto_url: 'x' });
    expect(payload).toHaveProperty('ultimo_contato');
    expect(payload).not.toHaveProperty('estado');
  });

  it('estado + contexto → ambos aplicados (com merge no contexto)', async () => {
    const selectB = makeBuilder({
      single: {
        data: { contexto: { veiculo_id: 'v1' } },
        error: null,
      },
    });
    const updateB = makeBuilder({ updateThenable: { data: null, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(updateB.builder);

    await updateSession('sess-1', {
      estado: 'aguardando_confirmacao_km',
      contexto: { km_lido: 200 },
    });

    const payload = updateB.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.estado).toBe('aguardando_confirmacao_km');
    expect(payload.contexto).toEqual({ veiculo_id: 'v1', km_lido: 200 });
  });

  it('sessão temporária (id "temp-...") → não chama supabase', async () => {
    await updateSession('temp-123', { estado: 'aguardando_foto_km' });
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('update com erro → loga update_failed', async () => {
    const updateB = makeBuilder({
      updateThenable: {
        data: null,
        error: { code: 'XX', message: 'boom' },
      },
    });
    supabaseFromMock.mockReturnValueOnce(updateB.builder);

    const consoleErrorSpy = vi.spyOn(console, 'error');

    await updateSession('sess-1', { estado: 'aguardando_foto_km' });

    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((line) => line.includes('update_failed'))).toBe(true);
  });
});

describe('sessionManager.resetToMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserva veiculo_id e veiculo_placa, descarta o resto', async () => {
    const selectB = makeBuilder({
      single: {
        data: {
          contexto: {
            veiculo_id: 'v1',
            veiculo_placa: 'ABC1D23',
            km_lido: 100,
            foto_url: 'x',
          },
        },
        error: null,
      },
    });
    const updateB = makeBuilder({ updateThenable: { data: null, error: null } });

    supabaseFromMock
      .mockReturnValueOnce(selectB.builder)
      .mockReturnValueOnce(updateB.builder);

    await resetToMenu('sess-1');

    expect(updateB.calls.update).toHaveBeenCalledTimes(1);
    const payload = updateB.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.estado).toBe('aguardando_acao');
    expect(payload.contexto).toEqual({
      veiculo_id: 'v1',
      veiculo_placa: 'ABC1D23',
    });
    expect(payload).toHaveProperty('ultimo_contato');
    expect(updateB.calls.eq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('sessão temporária → early return sem chamar supabase', async () => {
    await resetToMenu('temp-456');
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });
});

describe('sessionManager.limparSessoesExpiradas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sucesso → retorna a quantidade deletada e filtra por ultimo_contato < 24h', async () => {
    const deleteB = makeBuilder({
      selectThenable: {
        data: [{ id: '1' }, { id: '2' }],
        error: null,
      },
    });
    supabaseFromMock.mockReturnValueOnce(deleteB.builder);

    const before = Date.now();
    const count = await limparSessoesExpiradas();
    const after = Date.now();

    expect(count).toBe(2);
    expect(deleteB.calls.delete).toHaveBeenCalledTimes(1);

    // Filtrou por .lt('ultimo_contato', <iso ~24h atrás>)
    expect(deleteB.calls.lt).toHaveBeenCalledTimes(1);
    const [coluna, valor] = deleteB.calls.lt.mock.calls[0] as [string, string];
    expect(coluna).toBe('ultimo_contato');
    const limiteMs = new Date(valor).getTime();
    // O limite deve estar dentro do intervalo [before - 24h, after - 24h]
    expect(limiteMs).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000 - 5);
    expect(limiteMs).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000 + 5);
  });

  it('erro → retorna 0 e loga cleanup_failed', async () => {
    const deleteB = makeBuilder({
      selectThenable: {
        data: null,
        error: { code: 'XX', message: 'boom' },
      },
    });
    supabaseFromMock.mockReturnValueOnce(deleteB.builder);

    const consoleErrorSpy = vi.spyOn(console, 'error');

    const count = await limparSessoesExpiradas();

    expect(count).toBe(0);
    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((line) => line.includes('cleanup_failed'))).toBe(true);
  });
});

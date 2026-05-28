import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── ENV (viacep.ts le no top-level) ────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-test';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import {
  consultarCEP,
  normalizarCEP,
  validarFormatoCEP,
  formatarCEP,
} from '@/lib/cep/viacep';

// ─── HELPERS ────────────────────────────────────────────────────────────

type CacheRow = { logradouro: string | null; bairro: string | null; cidade: string; uf: string };

function mockCacheHit(row: CacheRow) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  // upsert nao deve ser chamado em cache hit, mas mockamos por seguranca
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  supabaseFromMock.mockReturnValue({ select, upsert });
  return { select, eq, maybeSingle, upsert };
}

function mockCacheMiss() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  supabaseFromMock.mockReturnValue({ select, upsert });
  return { select, eq, maybeSingle, upsert };
}

function mockFetchOk(body: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockFetchHttpError(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  });
}

function mockFetchAbortError() {
  return vi.fn().mockImplementation(async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  });
}

function mockFetchNetworkError(err = new Error('econnreset')) {
  return vi.fn().mockRejectedValue(err);
}

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('normalizarCEP', () => {
  it('remove caracteres nao-numericos', () => {
    expect(normalizarCEP('01310-100')).toBe('01310100');
    expect(normalizarCEP('01.310-100')).toBe('01310100');
    expect(normalizarCEP(' 01310 100 ')).toBe('01310100');
  });

  it('mantem digitos quando ja normalizado', () => {
    expect(normalizarCEP('01310100')).toBe('01310100');
  });

  it('aceita string vazia (retorna string vazia)', () => {
    expect(normalizarCEP('')).toBe('');
  });
});

describe('validarFormatoCEP', () => {
  it('aceita exatamente 8 digitos', () => {
    expect(validarFormatoCEP('01310100')).toBe(true);
  });

  it('rejeita menos de 8 digitos', () => {
    expect(validarFormatoCEP('0131010')).toBe(false);
    expect(validarFormatoCEP('1')).toBe(false);
    expect(validarFormatoCEP('')).toBe(false);
  });

  it('rejeita mais de 8 digitos', () => {
    expect(validarFormatoCEP('013101001')).toBe(false);
  });

  it('rejeita caracteres nao-numericos', () => {
    expect(validarFormatoCEP('01310-100')).toBe(false);
    expect(validarFormatoCEP('abcd1234')).toBe(false);
  });
});

describe('formatarCEP', () => {
  it('formata 8 digitos com hifen', () => {
    expect(formatarCEP('01310100')).toBe('01310-100');
  });

  it('reformata input com hifen', () => {
    expect(formatarCEP('01310-100')).toBe('01310-100');
  });

  it('reformata input com pontos/espaco', () => {
    expect(formatarCEP('01.310-100')).toBe('01310-100');
  });

  it('retorna input inalterado se invalido', () => {
    expect(formatarCEP('123')).toBe('123');
    expect(formatarCEP('')).toBe('');
  });
});

describe('consultarCEP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejeita CEP com formato invalido sem chamar Supabase nem fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await consultarCEP('123');

    expect(result).toEqual({ ok: false, motivo: 'cep_invalido' });
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retorna do cache quando hit (sem chamar fetch)', async () => {
    mockCacheHit({
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      uf: 'SP',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await consultarCEP('01310100');

    expect(result).toEqual({
      ok: true,
      cep: '01310100',
      endereco: {
        logradouro: 'Avenida Paulista',
        bairro: 'Bela Vista',
        cidade: 'Sao Paulo',
        uf: 'SP',
      },
      fonte: 'cache',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache hit com logradouro/bairro null → retorna string vazia', async () => {
    mockCacheHit({
      logradouro: null,
      bairro: null,
      cidade: 'Brasilia',
      uf: 'DF',
    });
    vi.stubGlobal('fetch', vi.fn());

    const result = await consultarCEP('70000000');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endereco.logradouro).toBe('');
      expect(result.endereco.bairro).toBe('');
      expect(result.endereco.cidade).toBe('Brasilia');
    }
  });

  it('consulta ViaCEP em cache miss + salva no cache (upsert)', async () => {
    const { upsert } = mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchOk({
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      localidade: 'Sao Paulo',
      uf: 'SP',
    }));

    const result = await consultarCEP('01310100');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.endereco).toEqual({
        logradouro: 'Avenida Paulista',
        bairro: 'Bela Vista',
        cidade: 'Sao Paulo',
        uf: 'SP',
      });
      expect(result.fonte).toBe('api');
    }

    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertPayload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertPayload.cep).toBe('01310100');
    expect(upsertPayload.cidade).toBe('Sao Paulo');
  });

  it('retorna nao_encontrado quando ViaCEP devolve { erro: true }', async () => {
    mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchOk({ erro: true }));

    const result = await consultarCEP('99999999');

    expect(result).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('retorna nao_encontrado quando ViaCEP devolve sem localidade/uf', async () => {
    mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchOk({ cep: '01310-100', logradouro: 'Av' }));

    const result = await consultarCEP('01310100');

    expect(result).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('retorna erro_rede em HTTP nao-OK', async () => {
    mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchHttpError(503));

    const result = await consultarCEP('01310100');

    expect(result).toEqual({ ok: false, motivo: 'erro_rede' });
  });

  it('retorna erro_rede em erro de fetch (econnreset)', async () => {
    mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchNetworkError(new Error('econnreset')));

    const result = await consultarCEP('01310100');

    expect(result).toEqual({ ok: false, motivo: 'erro_rede' });
  });

  it('retorna timeout quando fetch aborta (AbortError)', async () => {
    mockCacheMiss();
    vi.stubGlobal('fetch', mockFetchAbortError());

    const result = await consultarCEP('01310100');

    expect(result).toEqual({ ok: false, motivo: 'timeout' });
  });

  it('normaliza CEP com hifen antes de consultar', async () => {
    mockCacheHit({
      logradouro: 'Av',
      bairro: 'Centro',
      cidade: 'Sao Paulo',
      uf: 'SP',
    });
    vi.stubGlobal('fetch', vi.fn());

    const result = await consultarCEP('01310-100');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cep).toBe('01310100');
  });

  it('falha de cache (erro do supabase) nao impede consulta ao ViaCEP', async () => {
    // Mock cache que retorna erro mas data=null
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseFromMock.mockReturnValue({ select, upsert });

    vi.stubGlobal('fetch', mockFetchOk({
      cep: '01310-100',
      logradouro: 'Av',
      bairro: 'Centro',
      localidade: 'Sao Paulo',
      uf: 'SP',
    }));

    const result = await consultarCEP('01310100');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fonte).toBe('api');
  });

  it('falha ao salvar cache nao quebra o retorno bem-sucedido', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const upsert = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'XX', message: 'write fail' },
    });
    supabaseFromMock.mockReturnValue({ select, upsert });

    vi.stubGlobal('fetch', mockFetchOk({
      cep: '01310-100',
      logradouro: 'Av',
      bairro: 'Centro',
      localidade: 'Sao Paulo',
      uf: 'SP',
    }));

    const result = await consultarCEP('01310100');

    // Mesmo com upsert falhando, o resultado e ok
    expect(result.ok).toBe(true);
  });
});

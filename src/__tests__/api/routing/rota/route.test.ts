/**
 * Testes da API route GET /api/routing/rota/[id].
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { GET, PATCH } from '@/app/api/routing/rota/[id]/route';
import { NextRequest } from 'next/server';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

function makeReq() {
  return new NextRequest('http://localhost/api/routing/rota/abc');
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function setupOk(rota: Record<string, unknown> | null, paradas: Record<string, unknown>[]) {
  let chamadas = 0;
  supabaseFromMock.mockImplementation(() => {
    chamadas++;
    if (chamadas === 1) {
      // rotas_otimizadas — select.eq.maybeSingle
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: rota, error: null }),
          }),
        }),
      };
    }
    // paradas — select.eq.order
    return {
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: paradas, error: null }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/routing/rota/[id]', () => {
  it('200 com { rota, paradas }', async () => {
    const rota = { id: 'rota-1', motorista_id: 'm1', empresa_id: 'e1' };
    const paradas = [
      { id: 'p1', ordem: 1, rota_id: 'rota-1' },
      { id: 'p2', ordem: 2, rota_id: 'rota-1' },
    ];
    setupOk(rota, paradas);

    const res = await GET(makeReq(), makeParams('rota-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rota.id).toBe('rota-1');
    expect(body.paradas).toHaveLength(2);
  });

  it('404 quando rota nao encontrada', async () => {
    setupOk(null, []);

    const res = await GET(makeReq(), makeParams('nope'));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('rota_nao_encontrada');
  });

  it('500 em erro de DB na consulta de rota', async () => {
    supabaseFromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: null, error: { code: 'XX', message: 'boom' } }),
        }),
      }),
    }));

    const res = await GET(makeReq(), makeParams('rota-1'));

    expect(res.status).toBe(500);
  });

  it('200 com paradas vazias quando rota existe mas nao tem paradas', async () => {
    setupOk({ id: 'rota-1' }, []);

    const res = await GET(makeReq(), makeParams('rota-1'));

    expect(res.status).toBe(200);
    expect((await res.json()).paradas).toEqual([]);
  });
});

describe('PATCH /api/routing/rota/[id]', () => {
  function makePatchReq(body: unknown) {
    return new NextRequest('http://localhost/api/routing/rota/rota-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('200 e atualiza status no Supabase', async () => {
    supabaseFromMock.mockImplementation(() => ({
      update: (fields: Record<string, unknown>) => {
        expect(fields.status).toBe('concluida');
        return {
          eq: (col: string, val: string) => {
            expect(col).toBe('id');
            expect(val).toBe('rota-1');
            return {
              select: () => Promise.resolve({ data: [{ id: 'rota-1' }], error: null }),
            };
          },
        };
      },
    }));

    const res = await PATCH(makePatchReq({ status: 'concluida' }), makeParams('rota-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('400 se status nao for fornecido', async () => {
    const res = await PATCH(makePatchReq({}), makeParams('rota-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('status_obrigatorio');
  });

  it('400 se status for invalido', async () => {
    const res = await PATCH(makePatchReq({ status: 'invalido' }), makeParams('rota-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('status_invalido');
  });

  it('404 se rota nao for encontrada para atualizar', async () => {
    supabaseFromMock.mockImplementation(() => ({
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }));

    const res = await PATCH(makePatchReq({ status: 'concluida' }), makeParams('rota-1'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('rota_nao_encontrada');
  });

  it('500 em erro de banco', async () => {
    supabaseFromMock.mockImplementation(() => ({
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: null, error: { code: 'XX', message: 'db error' } }),
        }),
      }),
    }));

    const res = await PATCH(makePatchReq({ status: 'concluida' }), makeParams('rota-1'));
    expect(res.status).toBe(500);
  });
});


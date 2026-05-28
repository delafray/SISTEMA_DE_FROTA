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

import { GET } from '@/app/api/routing/rota/[id]/route';
import { NextRequest } from 'next/server';

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

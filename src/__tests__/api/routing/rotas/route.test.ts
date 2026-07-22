/**
 * Testes da API route GET /api/routing/rotas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { GET } from '@/app/api/routing/rotas/route';
import { NextRequest } from 'next/server';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

function makeReq(qs: string) {
  return new NextRequest(`http://localhost/api/routing/rotas?${qs}`);
}

function setupRotasOk(rotas: Array<Record<string, unknown>>, paradas: Array<{ rota_id: string }> = []) {
  let chamadas = 0;
  supabaseFromMock.mockImplementation(() => {
    chamadas++;
    if (chamadas === 1) {
      // rotas_otimizadas — select.eq.order.limit (e eventual .eq pra motorista)
      const limitMock = vi.fn().mockResolvedValue({ data: rotas, error: null });
      const orderMock = vi.fn(() => ({ limit: limitMock, eq: () => ({ limit: limitMock }) }));
      const eqMock = vi.fn(() => ({ order: orderMock }));
      const selectMock = vi.fn(() => ({ eq: eqMock }));
      return { select: selectMock };
    }
    // paradas — select.in
    return {
      select: () => ({
        in: () => Promise.resolve({ data: paradas, error: null }),
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

describe('GET /api/routing/rotas', () => {
  it('400 sem empresa_id', async () => {
    const res = await GET(makeReq(''));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('campo_obrigatorio');
  });

  it('200 com lista vazia quando nao ha rotas', async () => {
    setupRotasOk([], []);
    const res = await GET(makeReq('empresa_id=emp-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).rotas).toEqual([]);
  });

  it('200 com rotas enriquecidas (qtd_paradas)', async () => {
    setupRotasOk(
      [
        { id: 'r1', motorista_id: 'm1', empresa_id: 'emp-1', distancia_total_km: 10 },
        { id: 'r2', motorista_id: 'm2', empresa_id: 'emp-1', distancia_total_km: 20 },
      ],
      [{ rota_id: 'r1' }, { rota_id: 'r1' }, { rota_id: 'r1' }, { rota_id: 'r2' }]
    );

    const res = await GET(makeReq('empresa_id=emp-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rotas).toHaveLength(2);
    expect(body.rotas[0].qtd_paradas).toBe(3);
    expect(body.rotas[1].qtd_paradas).toBe(1);
  });

  it('500 em erro de DB', async () => {
    supabaseFromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: null, error: { code: 'XX', message: 'boom' } }),
          }),
        }),
      }),
    }));

    const res = await GET(makeReq('empresa_id=emp-1'));
    expect(res.status).toBe(500);
  });
});

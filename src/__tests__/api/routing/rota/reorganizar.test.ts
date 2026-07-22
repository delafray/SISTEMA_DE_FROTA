/**
 * Testes do POST /api/routing/rota/[id]/reorganizar.
 * Mocka Supabase (select de paradas) + VROOM (otimizarRota). Usa os helpers
 * reais de restricoes (indexarJobs/traduzir/montarVeiculo).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

vi.mock('@/lib/routing/vroom', async () => {
  const actual = await vi.importActual<typeof import('@/lib/routing/vroom')>('@/lib/routing/vroom');
  return { ...actual, otimizarRota: vi.fn() };
});

import { POST } from '@/app/api/routing/rota/[id]/reorganizar/route';
import { otimizarRota } from '@/lib/routing/vroom';
import { NextRequest } from 'next/server';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

const otimMock = otimizarRota as ReturnType<typeof vi.fn>;

function makeReq(body: unknown = {}) {
  return new NextRequest('http://localhost/api/routing/rota/r1/reorganizar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function paradaDB(over: Record<string, unknown> = {}) {
  return {
    id: 'p',
    ordem: 1,
    latitude: -23.5,
    longitude: -46.6,
    fixada: false,
    janela_horario: null,
    tempo_descarga_min: 5,
    concluida_em: null,
    ...over,
  };
}

function mockParadas(paradas: ReturnType<typeof paradaDB>[]) {
  supabaseFromMock.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: paradas, error: null }),
      })),
    })),
  });
}

const params = { params: Promise.resolve({ id: 'r1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST reorganizar — sem o que reorganizar', () => {
  it('400 quando nao ha rota_id', async () => {
    const res = await POST(makeReq(), { params: Promise.resolve({ id: '' }) });
    expect(res.status).toBe(400);
  });

  it('reorganizou=false quando ha menos de 2 pendentes', async () => {
    mockParadas([
      paradaDB({ id: 'c1', ordem: 1, concluida_em: '2026-05-31T10:00:00Z' }),
      paradaDB({ id: 'p1', ordem: 2 }),
    ]);

    const res = await POST(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reorganizou).toBe(false);
    expect(otimMock).not.toHaveBeenCalled();
  });
});

describe('POST reorganizar — happy path', () => {
  it('reordena pendentes pelo VROOM e mantem entregues no topo', async () => {
    mockParadas([
      paradaDB({ id: 'c1', ordem: 1, concluida_em: '2026-05-31T10:00:00Z' }),
      paradaDB({ id: 'p1', ordem: 2, latitude: -23.5, longitude: -46.6 }),
      paradaDB({ id: 'p2', ordem: 3, latitude: -23.6, longitude: -46.7 }),
      paradaDB({ id: 'p3', ordem: 4, latitude: -23.7, longitude: -46.8 }),
    ]);

    // VROOM devolve nova ordem: p2, p3, p1 (ids vroom 2,3,1)
    otimMock.mockResolvedValue({
      ok: true,
      resultado: {
        paradas: [
          { nota_id: '2', ordem: 1, chegada_estimada: '' },
          { nota_id: '3', ordem: 2, chegada_estimada: '' },
          { nota_id: '1', ordem: 3, chegada_estimada: '' },
        ],
        distancia_total_km: 10,
        tempo_total_min: 20,
        paradas_nao_atendidas: [],
      },
    });

    const res = await POST(makeReq({ origem: { lat: -23.4, lng: -46.5 } }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reorganizou).toBe(true);
    // entregue primeiro, depois p2, p3, p1
    expect(body.paradas).toEqual([
      { id: 'c1', ordem: 1 },
      { id: 'p2', ordem: 2 },
      { id: 'p3', ordem: 3 },
      { id: 'p1', ordem: 4 },
    ]);
    expect(body.nao_atendidas).toEqual([]);
  });

  it('paradas nao encaixadas pelo VROOM vao pro fim (nunca somem)', async () => {
    mockParadas([
      paradaDB({ id: 'p1', ordem: 1, latitude: -23.5, longitude: -46.6 }),
      paradaDB({ id: 'p2', ordem: 2, latitude: -23.6, longitude: -46.7 }),
      paradaDB({ id: 'p3', ordem: 3, latitude: -23.7, longitude: -46.8 }),
    ]);

    // VROOM so encaixou p2 e p1 (dropou p3)
    otimMock.mockResolvedValue({
      ok: true,
      resultado: {
        paradas: [
          { nota_id: '2', ordem: 1, chegada_estimada: '' },
          { nota_id: '1', ordem: 2, chegada_estimada: '' },
        ],
        distancia_total_km: 8,
        tempo_total_min: 15,
        paradas_nao_atendidas: ['3'],
      },
    });

    const res = await POST(makeReq(), params);
    const body = await res.json();
    expect(body.paradas).toEqual([
      { id: 'p2', ordem: 1 },
      { id: 'p1', ordem: 2 },
      { id: 'p3', ordem: 3 },
    ]);
    expect(body.nao_atendidas).toEqual(['p3']);
  });
});

describe('POST reorganizar — falhas', () => {
  it('500 db_fetch_failed quando o select falha', async () => {
    supabaseFromMock.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
        })),
      })),
    });

    const res = await POST(makeReq(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db_fetch_failed');
  });

  it('503 quando VROOM nao esta configurado', async () => {
    mockParadas([
      paradaDB({ id: 'p1', ordem: 1 }),
      paradaDB({ id: 'p2', ordem: 2, latitude: -23.6, longitude: -46.7 }),
    ]);
    otimMock.mockResolvedValue({ ok: false, motivo: 'config_faltando' });

    const res = await POST(makeReq(), params);
    expect(res.status).toBe(503);
  });

  it('500 quando VROOM nao acha solucao', async () => {
    mockParadas([
      paradaDB({ id: 'p1', ordem: 1 }),
      paradaDB({ id: 'p2', ordem: 2, latitude: -23.6, longitude: -46.7 }),
    ]);
    otimMock.mockResolvedValue({ ok: false, motivo: 'sem_solucao' });

    const res = await POST(makeReq(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('reorganizacao_falhou');
  });
});

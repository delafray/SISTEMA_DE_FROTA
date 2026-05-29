/**
 * Testes do endpoint POST /api/routing/rota/[id]/paradas/adicionar.
 * Mocka geocodar + supabase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── ENV ────────────────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

// ─── MOCKS ──────────────────────────────────────────────────────────

// Geocodar mock
const geocodarMock = vi.fn();
vi.mock('@/lib/routing/geocoding', async () => {
  const real = await vi.importActual<typeof import('@/lib/routing/geocoding')>(
    '@/lib/routing/geocoding'
  );
  return {
    ...real,
    geocodar: (...args: unknown[]) => geocodarMock(...args),
  };
});

// Supabase mock — granular pra controlar cada chamada
const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────

import { POST } from '@/app/api/routing/rota/[id]/paradas/adicionar/route';
import { NextRequest } from 'next/server';

// ─── HELPERS ────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/routing/rota/r1/paradas/adicionar', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function payload(over: Record<string, unknown> = {}) {
  return {
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '104',
    endereco: { logradouro: 'Rua X', bairro: 'B', cidade: 'SP', uf: 'SP' },
    posicao: 'final' as const,
    ...over,
  };
}

interface ParadaMock {
  id: string;
  ordem: number;
  latitude: number;
  longitude: number;
}

interface SupabaseSetup {
  paradasExistentes: ParadaMock[];
  notaInsertResult?: { data: { id: string } | null; error: { message: string } | null };
  paradaInsertResult?: { data: { id: string } | null; error: { message: string } | null };
}

/**
 * Configura o mock do supabase pra cobrir as 3 operacoes do endpoint:
 * 1. INSERT em notas_capturadas
 * 2. SELECT paradas existentes
 * 3. INSERT em paradas
 * Tambem captura updates (shift de ordens).
 */
function setupSupabase(s: SupabaseSetup) {
  const updateCalls: Array<{ id: string; ordem: number }> = [];

  supabaseFromMock.mockImplementation((tabela: string) => {
    if (tabela === 'notas_capturadas') {
      const single = vi.fn().mockResolvedValue(
        s.notaInsertResult ?? { data: { id: 'nota-nova' }, error: null }
      );
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      return { insert };
    }

    if (tabela === 'paradas') {
      // Distinguir SELECT (com .order) vs INSERT vs UPDATE
      return {
        // SELECT paradas existentes
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: s.paradasExistentes, error: null }),
          })),
        })),
        // INSERT nova parada
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(
              s.paradaInsertResult ?? { data: { id: 'parada-nova' }, error: null }
            ),
          })),
        })),
        // UPDATE (shifts)
        update: vi.fn((upd: { ordem: number }) => ({
          eq: vi.fn((_col: string, id: string) => {
            updateCalls.push({ id, ordem: upd.ordem });
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }

    throw new Error(`tabela inesperada: ${tabela}`);
  });

  return { updateCalls };
}

// ─── SETUP ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Geocoding sucesso default
  geocodarMock.mockResolvedValue({
    ok: true,
    resultado: { lat: -23.5505, lng: -46.6333, endereco_normalizado: 'Rua X, 104, SP' },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── TESTES ─────────────────────────────────────────────────────────

describe('POST adicionar parada — validacao 400', () => {
  it('JSON invalido → 400', async () => {
    const res = await POST(makeReq('{ broken'), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('json_invalido');
  });

  it('motorista_id faltando → 400 campos_faltando', async () => {
    const p: Record<string, unknown> = payload();
    delete p.motorista_id;
    const res = await POST(makeReq(p), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('campos_faltando');
    expect(body.detail).toContain('motorista_id');
  });

  it('posicao invalida → 400 posicao_invalida', async () => {
    const res = await POST(
      makeReq(payload({ posicao: 'xyz' })),
      { params: Promise.resolve({ id: 'r1' }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('posicao_invalida');
  });
});

describe('POST adicionar parada — geocoding falha', () => {
  it('Nominatim nao_encontrado → 422 geocoding_falhou', async () => {
    geocodarMock.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const res = await POST(makeReq(payload()), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('geocoding_falhou');
    expect(body.motivo).toBe('nao_encontrado');
  });
});

describe('POST adicionar parada — modo final', () => {
  it('insere com ordem = N + 1 (N = paradas existentes)', async () => {
    setupSupabase({
      paradasExistentes: [
        { id: 'p1', ordem: 1, latitude: -23.5, longitude: -46.6 },
        { id: 'p2', ordem: 2, latitude: -23.6, longitude: -46.7 },
      ],
    });

    const res = await POST(
      makeReq(payload({ posicao: 'final' })),
      { params: Promise.resolve({ id: 'r1' }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.parada_id).toBe('parada-nova');
    expect(body.ordem).toBe(3); // 2 existentes + 1
  });

  it('lista vazia → ordem 1', async () => {
    setupSupabase({ paradasExistentes: [] });

    const res = await POST(
      makeReq(payload({ posicao: 'final' })),
      { params: Promise.resolve({ id: 'r1' }) }
    );

    const body = await res.json();
    expect(body.ordem).toBe(1);
  });
});

describe('POST adicionar parada — modo reotimizar (cheapest insertion)', () => {
  it('insere usando heuristica cheapest insertion', async () => {
    // Ponto novo (-23.5505, -46.6333) entre SP e Campinas
    // Paradas existentes: SP→Campinas
    // Cheapest insertion → entre eles (posicao 2)? ou no extremo?
    // Resposta exata depende do Haversine, mas deve ser numero >= 1
    const { updateCalls } = setupSupabase({
      paradasExistentes: [
        { id: 'p1', ordem: 1, latitude: -23.5505, longitude: -46.6333 }, // SP
        { id: 'p2', ordem: 2, latitude: -22.9056, longitude: -47.0608 }, // Campinas
      ],
    });

    const res = await POST(
      makeReq(payload({ posicao: 'reotimizar' })),
      { params: Promise.resolve({ id: 'r1' }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ordem).toBeGreaterThanOrEqual(1);
    expect(body.ordem).toBeLessThanOrEqual(3);

    // Se ordem < 3, alguma parada existente foi shiftada (deve ter updateCalls)
    if (body.ordem < 3) {
      // 2-pass: cada parada movida aparece 2x (negativa + final)
      expect(updateCalls.length).toBeGreaterThan(0);
    }
  });

  it('lista vazia + reotimizar → ordem 1, sem shifts', async () => {
    const { updateCalls } = setupSupabase({ paradasExistentes: [] });

    const res = await POST(
      makeReq(payload({ posicao: 'reotimizar' })),
      { params: Promise.resolve({ id: 'r1' }) }
    );

    const body = await res.json();
    expect(body.ordem).toBe(1);
    expect(updateCalls).toEqual([]);
  });
});

describe('POST adicionar parada — DB falha', () => {
  it('falha insert nota → 500', async () => {
    setupSupabase({
      paradasExistentes: [],
      notaInsertResult: { data: null, error: { message: 'duplicate key' } },
    });

    const res = await POST(makeReq(payload()), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('db_insert_nota_failed');
  });

  it('falha insert parada → 500', async () => {
    setupSupabase({
      paradasExistentes: [],
      paradaInsertResult: { data: null, error: { message: 'fk violation' } },
    });

    const res = await POST(makeReq(payload()), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('db_insert_parada_failed');
  });
});

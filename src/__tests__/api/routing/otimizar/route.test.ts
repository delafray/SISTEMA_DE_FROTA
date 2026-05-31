/**
 * Testes da API route POST /api/routing/otimizar.
 * Mocka Supabase + VROOM + geocoding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

vi.mock('@/lib/routing/vroom', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/routing/vroom')>('@/lib/routing/vroom');
  return { ...actual, otimizarRota: vi.fn() };
});

// Mockamos `resolverCoordenada` direto. A prioridade (aprendida > Overpass >
// Nominatim) tem testes unitarios proprios em resolverCoordenada.test.ts. Aqui
// so importa o resultado (coord ou null) pra exercitar notas_atendidas.
vi.mock('@/lib/routing/resolverCoordenada', () => ({
  resolverCoordenada: vi.fn(),
}));

import { POST } from '@/app/api/routing/otimizar/route';
import { otimizarRota } from '@/lib/routing/vroom';
import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';
import { NextRequest } from 'next/server';

const ORIGEM = { lat: -23.5505, lng: -46.6333 };

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/otimizar', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function notaSeed(over: Record<string, unknown> = {}) {
  return {
    id: 'nota-1',
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '123',
    endereco: { logradouro: 'Av X', bairro: 'B', cidade: 'SP', uf: 'SP' },
    latitude: -23.5,
    longitude: -46.6,
    observacao: null,
    status: 'geocodificada',
    capturado_em: '2026-05-28T10:00:00Z',
    sincronizado_em: '2026-05-28T10:00:05Z',
    ...over,
  };
}

function setupMocks(opts: {
  notas: ReturnType<typeof notaSeed>[];
  vroomOk?: boolean;
  rotaId?: string;
}) {
  const notasResult = { data: opts.notas, error: null };

  // Default: in(...) (select).eq().in() devolve notas; insert (rota).select.single → id;
  // update (nota lat/lng); insert (paradas).select → array
  const tableMocks: Record<string, () => unknown> = {
    notas_capturadas: () => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve(notasResult)),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        in: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    }),
    rotas_otimizadas: () => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: opts.rotaId ?? 'rota-uuid-1' },
            error: null,
          }),
        })),
      })),
    }),
    paradas: () => ({
      insert: vi.fn(() => ({
        select: vi.fn(() =>
          Promise.resolve({
            data: opts.notas.map((n, i) => ({
              id: `parada-${i}`,
              rota_id: opts.rotaId ?? 'rota-uuid-1',
              nota_id: n.id,
              ordem: i + 1,
              endereco: n.endereco,
              latitude: n.latitude,
              longitude: n.longitude,
              fixada: false,
              janela_horario: null,
              tempo_descarga_min: 5,
              observacao: null,
            })),
            error: null,
          })
        ),
      })),
    }),
  };

  supabaseFromMock.mockImplementation((table: string) => {
    const m = tableMocks[table];
    if (!m) throw new Error(`tabela nao mockada: ${table}`);
    return m();
  });

  if (opts.vroomOk !== false) {
    (otimizarRota as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      resultado: {
        paradas: opts.notas.map((_, i) => ({
          nota_id: String(i + 1),
          ordem: i + 1,
          chegada_estimada: '2026-05-28T10:30:00Z',
        })),
        distancia_total_km: 15,
        tempo_total_min: 30,
        paradas_nao_atendidas: [],
      },
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/routing/otimizar — validacao', () => {
  it('400 json invalido', async () => {
    const req = new NextRequest('http://localhost/api/routing/otimizar', {
      method: 'POST',
      body: '{ nao json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('json_invalido');
  });

  it('400 quando campos obrigatorios faltam', async () => {
    const res = await POST(makeReq({ motorista_id: 'mot-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('campos_obrigatorios');
  });
});

describe('POST /api/routing/otimizar — sucesso', () => {
  it('201 com paradas, rota_id, distancia, tempo', async () => {
    setupMocks({
      notas: [notaSeed({ id: 'n1' }), notaSeed({ id: 'n2', latitude: -23.6, longitude: -46.7 })],
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rota_id).toBe('rota-uuid-1');
    expect(body.paradas).toHaveLength(2);
    expect(body.distancia_total_km).toBe(15);
    expect(body.tempo_total_min).toBe(30);
    expect(body.nao_atendidas).toEqual([]);
  });

  it('400 sem_notas quando motorista nao tem notas pendentes', async () => {
    setupMocks({ notas: [] });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('sem_notas');
  });

  it('geocodifica notas sem lat/lng antes de chamar VROOM', async () => {
    setupMocks({
      notas: [
        notaSeed({ id: 'n-sem-coords', latitude: null, longitude: null, status: 'capturada' }),
      ],
    });
    (resolverCoordenada as ReturnType<typeof vi.fn>).mockResolvedValue({
      lat: -23.5,
      lng: -46.6,
      confianca: 'baixa',
      fonte: 'nominatim',
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(201);
    expect(resolverCoordenada).toHaveBeenCalled();
  });

  it('inclui em nao_atendidas as notas que geocoding falhou', async () => {
    setupMocks({
      notas: [
        notaSeed({ id: 'n-ok', latitude: -23.5, longitude: -46.6 }),
        notaSeed({ id: 'n-fail', latitude: null, longitude: null }),
      ],
    });
    (resolverCoordenada as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // VROOM recebe so 1 nota (n-ok) — sobrescreve o mock que setupMocks fez com 2
    (otimizarRota as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      resultado: {
        paradas: [{ nota_id: '1', ordem: 1, chegada_estimada: '2026-05-28T10:30:00Z' }],
        distancia_total_km: 5,
        tempo_total_min: 10,
        paradas_nao_atendidas: [],
      },
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    const body = await res.json();
    expect(body.nao_atendidas).toContain('n-fail');
  });
});

describe('POST /api/routing/otimizar — falhas', () => {
  it('500 quando todas geocodings falham', async () => {
    setupMocks({
      notas: [notaSeed({ id: 'n1', latitude: null, longitude: null })],
    });
    (resolverCoordenada as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('todas_geocoding_falharam');
  });

  it('500 quando VROOM falha (sem_solucao)', async () => {
    setupMocks({ notas: [notaSeed()], vroomOk: true });
    (otimizarRota as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'sem_solucao',
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('otimizacao_falhou');
  });

  it('503 quando VROOM_URL nao configurado (config_faltando)', async () => {
    setupMocks({ notas: [notaSeed()], vroomOk: true });
    (otimizarRota as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'config_faltando',
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(503);
  });
});

describe('POST /api/routing/otimizar — resolver de coordenada', () => {
  // Prioridade (aprendida > Overpass > Nominatim) testada em
  // resolverCoordenada.test.ts. Aqui apenas validamos a integracao:
  // coord → nota entra na rota; null → nota cai em nao_atendidas.

  it('resolverCoordenada retorna coord → nota entra na rota', async () => {
    setupMocks({
      notas: [
        notaSeed({ id: 'n-fallback', latitude: null, longitude: null, status: 'capturada' }),
      ],
    });

    (resolverCoordenada as ReturnType<typeof vi.fn>).mockResolvedValue({
      lat: -19.92,
      lng: -43.93,
      confianca: 'baixa',
      fonte: 'nominatim',
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.nao_atendidas).not.toContain('n-fallback');
  });

  it('resolverCoordenada retorna null → nota cai em nao_atendidas', async () => {
    setupMocks({
      notas: [
        notaSeed({ id: 'n-ok', latitude: -23.5, longitude: -46.6 }),
        notaSeed({ id: 'n-todas-falharam', latitude: null, longitude: null }),
      ],
    });

    (resolverCoordenada as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (otimizarRota as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      resultado: {
        paradas: [{ nota_id: '1', ordem: 1, chegada_estimada: '2026-05-28T10:30:00Z' }],
        distancia_total_km: 5,
        tempo_total_min: 10,
        paradas_nao_atendidas: [],
      },
    });

    const res = await POST(
      makeReq({ motorista_id: 'mot-1', empresa_id: 'emp-1', origem: ORIGEM })
    );

    const body = await res.json();
    expect(body.nao_atendidas).toContain('n-todas-falharam');
  });
});

/**
 * Testes do GET /api/routing/geocode-uso — uso do mês do Google + restante.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/routing/geocodeCache', () => ({
  lerUsoMes: vi.fn(),
}));

import { GET } from '@/app/api/routing/geocode-uso/route';
import { lerUsoMes } from '@/lib/routing/geocodeCache';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

const usoMock = lerUsoMes as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/routing/geocode-uso', () => {
  it('devolve mes, total, limite e restante calculado', async () => {
    usoMock.mockResolvedValue({ mes: '2026-06', total: 100, limite: 9800 });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ mes: '2026-06', total: 100, limite: 9800, restante: 9700 });
  });

  it('restante nunca é negativo (estourou o teto)', async () => {
    usoMock.mockResolvedValue({ mes: '2026-06', total: 10000, limite: 9800 });
    const res = await GET();
    const body = await res.json();
    expect(body.restante).toBe(0);
  });
});

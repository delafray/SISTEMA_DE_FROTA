/**
 * Testes para geocodarMultiplos e calcularDistanciaKm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodarMultiplos, calcularDistanciaKm, _resetRateLimit } from '@/lib/routing/geocoding';

// ─── helpers ────────────────────────────────────────────────────────

function nominatimItem(lat: string, lon: string, display: string) {
  return { lat, lon, display_name: display };
}

function mockFetch(items: ReturnType<typeof nominatimItem>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => items,
    })
  );
}

beforeEach(() => {
  _resetRateLimit();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── calcularDistanciaKm ─────────────────────────────────────────────

describe('calcularDistanciaKm', () => {
  it('mesma coordenada = 0 km', () => {
    expect(calcularDistanciaKm(-23.55, -46.63, -23.55, -46.63)).toBeCloseTo(0, 5);
  });

  it('São Paulo → Rio de Janeiro ≈ 360 km', () => {
    const km = calcularDistanciaKm(-23.55, -46.63, -22.91, -43.17);
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThan(380);
  });

  it('resultado é simétrico', () => {
    const a = calcularDistanciaKm(-23.55, -46.63, -22.91, -43.17);
    const b = calcularDistanciaKm(-22.91, -43.17, -23.55, -46.63);
    expect(a).toBeCloseTo(b, 5);
  });
});

// ─── geocodarMultiplos ───────────────────────────────────────────────

describe('geocodarMultiplos', () => {
  it('retorna nao_encontrado quando nominatim retorna lista vazia', async () => {
    mockFetch([]);
    const r = await geocodarMultiplos('Endereço Inexistente');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('nao_encontrado');
  });

  it('retorna endereco_invalido para texto muito curto', async () => {
    const r = await geocodarMultiplos('ab');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('endereco_invalido');
  });

  it('retorna lista de resultados quando nominatim retorna multiplos', async () => {
    mockFetch([
      nominatimItem('-23.55', '-46.63', 'Rua A, São Paulo, SP'),
      nominatimItem('-22.91', '-43.17', 'Rua A, Rio de Janeiro, RJ'),
    ]);
    const r = await geocodarMultiplos('Rua A');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultados).toHaveLength(2);
      expect(r.resultados[0].endereco_normalizado).toBe('Rua A, São Paulo, SP');
    }
  });

  it('ordena por distancia ao usuario quando lat/lng fornecidos', async () => {
    // Usuário está em SP (-23.55, -46.63)
    // Rua A em RJ está mais longe que Rua A em SP
    mockFetch([
      nominatimItem('-22.91', '-43.17', 'Rua A, Rio de Janeiro, RJ'),  // 360 km
      nominatimItem('-23.55', '-46.63', 'Rua A, São Paulo, SP'),         // ~0 km
    ]);
    const r = await geocodarMultiplos('Rua A', 5, -23.55, -46.63);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // SP deve vir primeiro (mais próxima)
      expect(r.resultados[0].endereco_normalizado).toContain('São Paulo');
      expect(r.resultados[1].endereco_normalizado).toContain('Rio de Janeiro');
    }
  });

  it('funciona sem coordenadas do usuario (sem ordenacao por distancia)', async () => {
    mockFetch([
      nominatimItem('-22.91', '-43.17', 'Rua A, Rio de Janeiro, RJ'),
      nominatimItem('-23.55', '-46.63', 'Rua A, São Paulo, SP'),
    ]);
    const r = await geocodarMultiplos('Rua A', 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultados).toHaveLength(2);
    }
  });

  it('retorna erro_rede quando Nominatim retorna status nao-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => [] })
    );
    const r = await geocodarMultiplos('Rua X');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('erro_rede');
  });

  it('retorna timeout quando fetch aborta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    );
    const r = await geocodarMultiplos('Rua X');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('timeout');
  });

  it('respeita limite maximo de 10 resultados', async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      nominatimItem(String(-23 - i * 0.01), '-46.63', `Rua ${i}`)
    );
    mockFetch(items);
    // Pedindo 15, deve limitar pra 10 na query
    const r = await geocodarMultiplos('Rua', 15);
    expect(r.ok).toBe(true);
    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(fetchCall).toContain('limit=10');
  });
});

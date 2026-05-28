/**
 * Testes do cliente OSRM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularRota, calcularRotaSimples } from '@/lib/routing/osrm';

const SP = { lat: -23.5505, lng: -46.6333 };
const CAMPINAS = { lat: -22.9056, lng: -47.0608 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.OSRM_URL = 'http://test-osrm:5000';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetchOk(routes: Array<{ distance: number; duration: number; geometry?: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 'Ok', routes }),
  });
}

describe('calcularRota — validacao', () => {
  it('rejeita < 2 pontos', async () => {
    const r = await calcularRota([SP]);
    expect(r).toEqual({ ok: false, motivo: 'sem_rota' });
  });

  it('rejeita 0 pontos', async () => {
    const r = await calcularRota([]);
    expect(r).toEqual({ ok: false, motivo: 'sem_rota' });
  });

  it('config_faltando quando OSRM_URL nao esta definido', async () => {
    delete process.env.OSRM_URL;
    const r = await calcularRota([SP, CAMPINAS]);
    expect(r).toEqual({ ok: false, motivo: 'config_faltando' });
  });
});

describe('calcularRota — sucesso', () => {
  it('retorna distancia em KM, tempo em minutos, polyline', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk([
        { distance: 95000, duration: 4200, geometry: 'abc123polyline' },
      ])
    );

    const r = await calcularRota([SP, CAMPINAS]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rota.distanciaKm).toBe(95);
      expect(r.rota.tempoMin).toBe(70);
      expect(r.rota.polyline).toBe('abc123polyline');
    }
  });

  it('monta URL com lng,lat;lng,lat na ordem', async () => {
    const fetchMock = mockFetchOk([{ distance: 1000, duration: 60 }]);
    vi.stubGlobal('fetch', fetchMock);

    await calcularRota([SP, CAMPINAS]);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('-46.6333,-23.5505;-47.0608,-22.9056');
  });

  it('inclui overview=full e geometries=polyline na query', async () => {
    const fetchMock = mockFetchOk([{ distance: 1000, duration: 60 }]);
    vi.stubGlobal('fetch', fetchMock);

    await calcularRota([SP, CAMPINAS]);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('overview=full');
    expect(url).toContain('geometries=polyline');
  });

  it('aceita 3+ waypoints', async () => {
    const fetchMock = mockFetchOk([{ distance: 5000, duration: 300 }]);
    vi.stubGlobal('fetch', fetchMock);

    await calcularRota([SP, CAMPINAS, { lat: -23.0, lng: -47.0 }]);

    const url = fetchMock.mock.calls[0][0] as string;
    // 3 pontos -> 2 separadores ';'
    const segCoords = url.split('/driving/')[1].split('?')[0];
    expect(segCoords.split(';').length).toBe(3);
  });
});

describe('calcularRota — erros', () => {
  it('code != "Ok" → sem_rota', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'NoRoute', routes: [] }),
      })
    );

    const r = await calcularRota([SP, CAMPINAS]);

    expect(r).toEqual({ ok: false, motivo: 'sem_rota' });
  });

  it('HTTP 500 → erro_rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const r = await calcularRota([SP, CAMPINAS]);

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });

  it('AbortError → timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      })
    );

    const r = await calcularRota([SP, CAMPINAS]);

    expect(r).toEqual({ ok: false, motivo: 'timeout' });
  });

  it('fetch reject → erro_rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnreset')));

    const r = await calcularRota([SP, CAMPINAS]);

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });
});

describe('calcularRotaSimples', () => {
  it('e helper de calcularRota com 2 pontos', async () => {
    vi.stubGlobal('fetch', mockFetchOk([{ distance: 1000, duration: 60 }]));

    const r = await calcularRotaSimples(SP, CAMPINAS);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rota.distanciaKm).toBe(1);
  });
});

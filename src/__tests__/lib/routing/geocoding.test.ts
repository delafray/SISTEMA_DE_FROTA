/**
 * Testes do cliente Nominatim (geocoding).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  geocodar,
  formatarEnderecoParaGeocoding,
  _resetRateLimit,
} from '@/lib/routing/geocoding';

function mockFetchOk(items: Array<{ lat: string; lon: string; display_name: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => items,
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

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('econnreset'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  _resetRateLimit();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('formatarEnderecoParaGeocoding', () => {
  it('monta endereco completo com todas as partes', () => {
    const r = formatarEnderecoParaGeocoding({
      logradouro: 'Avenida Paulista',
      numero: '1500',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      uf: 'SP',
      cep: '01310100',
    });
    expect(r).toBe('Avenida Paulista, 1500, Bela Vista, Sao Paulo, SP, 01310100, Brasil');
  });

  it('omite partes vazias/undefined', () => {
    const r = formatarEnderecoParaGeocoding({
      cidade: 'Belo Horizonte',
      uf: 'MG',
    });
    expect(r).toBe('Belo Horizonte, MG, Brasil');
  });

  it('omite strings com so espaco', () => {
    const r = formatarEnderecoParaGeocoding({
      logradouro: '   ',
      cidade: 'Brasilia',
      uf: 'DF',
    });
    expect(r).toBe('Brasilia, DF, Brasil');
  });

  it('sempre anexa "Brasil" ao final', () => {
    const r = formatarEnderecoParaGeocoding({ cidade: 'X', uf: 'SP' });
    expect(r.endsWith('Brasil')).toBe(true);
  });
});

describe('geocodar — validacao', () => {
  it('rejeita endereco vazio sem chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await geocodar('');

    expect(r).toEqual({ ok: false, motivo: 'endereco_invalido' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita endereco com < 3 caracteres', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await geocodar('ab');

    expect(r).toEqual({ ok: false, motivo: 'endereco_invalido' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('geocodar — sucesso', () => {
  it('retorna lat/lng/endereco_normalizado do primeiro item', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk([
        {
          lat: '-23.5610',
          lon: '-46.6565',
          display_name: 'Avenida Paulista, 1500, Sao Paulo, SP, Brasil',
        },
      ])
    );

    const r = await geocodar('Avenida Paulista, 1500, Sao Paulo, SP');

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado.lat).toBe(-23.561);
      expect(r.resultado.lng).toBe(-46.6565);
      expect(r.resultado.endereco_normalizado).toContain('Avenida Paulista');
    }
  });

  it('chama Nominatim com User-Agent', async () => {
    const fetchMock = mockFetchOk([{ lat: '0', lon: '0', display_name: 'X' }]);
    vi.stubGlobal('fetch', fetchMock);

    await geocodar('teste teste teste');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/SistemaDeFrota/);
  });

  it('inclui countrycodes=br + format=json + limit=1 na query', async () => {
    const fetchMock = mockFetchOk([{ lat: '0', lon: '0', display_name: 'X' }]);
    vi.stubGlobal('fetch', fetchMock);

    await geocodar('teste teste teste');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('countrycodes=br');
    expect(url).toContain('format=json');
    expect(url).toContain('limit=1');
  });
});

describe('geocodar — nao encontrado', () => {
  it('array vazio → nao_encontrado', async () => {
    vi.stubGlobal('fetch', mockFetchOk([]));

    const r = await geocodar('rua que nao existe xyz123');

    expect(r).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('lat/lon nao-numericos → nao_encontrado', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk([{ lat: 'abc', lon: 'def', display_name: 'X' }])
    );

    const r = await geocodar('endereco teste teste');

    expect(r).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });
});

describe('geocodar — erros', () => {
  it('HTTP 503 → erro_rede', async () => {
    vi.stubGlobal('fetch', mockFetchHttpError(503));

    const r = await geocodar('endereco teste');

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });

  it('AbortError → timeout', async () => {
    vi.stubGlobal('fetch', mockFetchAbortError());

    const r = await geocodar('endereco teste');

    expect(r).toEqual({ ok: false, motivo: 'timeout' });
  });

  it('fetch reject (network) → erro_rede', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError());

    const r = await geocodar('endereco teste');

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });
});

describe('geocodar — rate limit (1 req/s)', () => {
  it('chamadas consecutivas respeitam intervalo minimo de 1100ms', async () => {
    vi.stubGlobal('fetch', mockFetchOk([{ lat: '0', lon: '0', display_name: 'X' }]));

    const t0 = Date.now();
    await geocodar('endereco teste 1');
    const t1 = Date.now();
    await geocodar('endereco teste 2');
    const t2 = Date.now();

    // Primeira chamada — sem delay
    expect(t1 - t0).toBeLessThan(500);
    // Segunda chamada — pelo menos ~1.1s depois
    expect(t2 - t1).toBeGreaterThanOrEqual(1000);
  }, 10000);
});

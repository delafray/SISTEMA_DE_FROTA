/**
 * Testes do cache de geocoding + cota mensal. Mocka o supabase-js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

// Mock granular do supabase: controla maybeSingle / upsert / rpc por teste.
const maybeSingleMock = vi.fn();
const upsertMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
      })),
      upsert: upsertMock,
    })),
    rpc: rpcMock,
  })),
}));

const googleMock = vi.fn();
vi.mock('@/lib/routing/googleGeocoding', () => ({
  geocodarGoogle: (...args: unknown[]) => googleMock(...args),
}));

import {
  chaveGeocode,
  mesAtual,
  montarQueryEstruturada,
  lerGeocodeCache,
  gravarGeocodeCache,
  consumirCota,
  resolverGoogleCacheado,
} from '@/lib/routing/geocodeCache';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chaveGeocode', () => {
  it('normaliza acento, caixa e pontuacao', () => {
    expect(chaveGeocode('Av. Afonso Pena, 342 - BH')).toBe('av afonso pena 342 bh');
    expect(chaveGeocode('Rua Piatã')).toBe('rua piata');
  });

  it('consultas equivalentes caem na mesma chave', () => {
    expect(chaveGeocode('AVENIDA   AFONSO  PENA')).toBe(chaveGeocode('avenida afonso pena'));
  });
});

describe('montarQueryEstruturada', () => {
  it('monta "Logradouro, Numero, Bairro, Cidade - UF, CEP"', () => {
    expect(
      montarQueryEstruturada({
        logradouro: 'Rua Piatã', numero: '104', bairro: 'São Mateus',
        cidade: 'Contagem', uf: 'MG', cep: '32180650',
      }),
    ).toBe('Rua Piatã, 104, São Mateus, Contagem - MG, 32180650');
  });

  it('ignora partes ausentes', () => {
    expect(montarQueryEstruturada({ logradouro: 'Rua X', cidade: 'SP', uf: 'SP' })).toBe(
      'Rua X, SP - SP',
    );
  });
});

describe('mesAtual', () => {
  it('formata YYYY-MM', () => {
    expect(mesAtual(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06');
    expect(mesAtual(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(mesAtual(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('lerGeocodeCache', () => {
  it('hit → devolve resultado parseado', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        lat: -19.92, lng: -43.93, cep: '30130009', logradouro: 'Avenida Afonso Pena',
        numero: '342', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG',
        precisao: 'ROOFTOP', endereco_formatado: 'Av. Afonso Pena, 342',
      },
      error: null,
    });
    const r = await lerGeocodeCache('avenida afonso pena 342 bh');
    expect(r).not.toBeNull();
    expect(r?.cep).toBe('30130009');
    expect(r?.uf).toBe('MG');
    expect(r?.precisao).toBe('ROOFTOP');
  });

  it('miss → null', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await lerGeocodeCache('rua inexistente xyz')).toBeNull();
  });

  it('erro de leitura → null (nao lanca)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { code: 'X', message: 'boom' } });
    expect(await lerGeocodeCache('rua x sao paulo')).toBeNull();
  });

  it('chave curta → null sem consultar', async () => {
    expect(await lerGeocodeCache('a')).toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });
});

describe('gravarGeocodeCache', () => {
  it('faz upsert com a chave normalizada', async () => {
    upsertMock.mockResolvedValue({ error: null });
    await gravarGeocodeCache('Av. Afonso Pena, 342 - BH', {
      lat: -19.92, lng: -43.93, cep: '30130009', endereco_formatado: 'x',
    });
    expect(upsertMock).toHaveBeenCalledOnce();
    const arg = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.chave).toBe('av afonso pena 342 bh');
    expect(arg.cep).toBe('30130009');
    expect(arg.fonte).toBe('google');
  });

  it('erro no upsert nao lanca', async () => {
    upsertMock.mockResolvedValue({ error: { code: 'X', message: 'boom' } });
    await expect(
      gravarGeocodeCache('rua x sao paulo', { lat: 1, lng: 2, endereco_formatado: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('consumirCota', () => {
  it('RPC permite → { permitido:true, total } e passa mes + limite', async () => {
    rpcMock.mockResolvedValue({ data: [{ permitido: true, total: 5 }], error: null });
    const r = await consumirCota();
    expect(r).toEqual({ permitido: true, total: 5 });
    expect(rpcMock).toHaveBeenCalledWith(
      'consumir_geocode_cota',
      expect.objectContaining({ p_limite: 9800, p_mes: expect.stringMatching(/^\d{4}-\d{2}$/) }),
    );
  });

  it('RPC nega (cota estourada) → permitido:false', async () => {
    rpcMock.mockResolvedValue({ data: [{ permitido: false, total: 38000 }], error: null });
    const r = await consumirCota();
    expect(r.permitido).toBe(false);
    expect(r.total).toBe(38000);
  });

  it('erro na RPC → permitido:false (degrada pro gratis, nao arrisca fatura)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'X', message: 'boom' } });
    const r = await consumirCota();
    expect(r.permitido).toBe(false);
  });
});

describe('resolverGoogleCacheado', () => {
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('cache HIT → fonte cache, NAO chama Google', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { lat: -19.9, lng: -43.9, cep: '30130009', precisao: 'ROOFTOP', endereco_formatado: 'x' },
      error: null,
    });
    const r = await resolverGoogleCacheado('avenida afonso pena 342 bh');
    expect(r?.fonte).toBe('cache');
    expect(r?.resultado.cep).toBe('30130009');
    expect(googleMock).not.toHaveBeenCalled();
  });

  it('miss + sem chave → null (nem consome cota nem chama Google)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const r = await resolverGoogleCacheado('rua x sao paulo');
    expect(r).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(googleMock).not.toHaveBeenCalled();
  });

  it('miss + chave + cota OK + Google OK → fonte google, grava cache', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValue({ data: [{ permitido: true, total: 1 }], error: null });
    upsertMock.mockResolvedValue({ error: null });
    googleMock.mockResolvedValue({
      ok: true,
      resultados: [{ lat: -19.92, lng: -43.93, cep: '30130009', precisao: 'ROOFTOP', endereco_formatado: 'x' }],
    });
    const r = await resolverGoogleCacheado('avenida afonso pena 342 bh');
    expect(r?.fonte).toBe('google');
    expect(r?.resultado.precisao).toBe('ROOFTOP');
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it('miss + chave + cota ESTOURADA → null (nao chama Google)', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValue({ data: [{ permitido: false, total: 38000 }], error: null });
    const r = await resolverGoogleCacheado('rua x sao paulo');
    expect(r).toBeNull();
    expect(googleMock).not.toHaveBeenCalled();
  });
});

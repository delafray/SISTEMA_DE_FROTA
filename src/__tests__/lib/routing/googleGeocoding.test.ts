/**
 * Testes do cliente Google Geocoding. Mocka fetch + GOOGLE_MAPS_API_KEY.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodarGoogle } from '@/lib/routing/googleGeocoding';

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => payload })) as unknown as typeof fetch,
  );
}

const respostaOK = {
  status: 'OK',
  results: [
    {
      formatted_address: 'Av. Afonso Pena, 342 - Centro, Belo Horizonte - MG, 30130-009, Brasil',
      geometry: { location: { lat: -19.9245, lng: -43.9352 }, location_type: 'ROOFTOP' },
      partial_match: false,
      address_components: [
        { long_name: '342', short_name: '342', types: ['street_number'] },
        { long_name: 'Avenida Afonso Pena', short_name: 'Av. Afonso Pena', types: ['route'] },
        { long_name: 'Centro', short_name: 'Centro', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { long_name: 'Belo Horizonte', short_name: 'Belo Horizonte', types: ['administrative_area_level_2', 'political'] },
        { long_name: 'Minas Gerais', short_name: 'MG', types: ['administrative_area_level_1', 'political'] },
        { long_name: '30130-009', short_name: '30130-009', types: ['postal_code'] },
      ],
    },
  ],
};

beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('geocodarGoogle', () => {
  it('sem GOOGLE_MAPS_API_KEY → { ok:false, sem_chave } (cai no fluxo gratis)', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const r = await geocodarGoogle('avenida afonso pena 342 belo horizonte');
    expect(r).toEqual({ ok: false, motivo: 'sem_chave' });
  });

  it('query curta → requisicao_invalida (nao chama a API)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f as unknown as typeof fetch);
    const r = await geocodarGoogle('ab');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('requisicao_invalida');
    expect(f).not.toHaveBeenCalled();
  });

  it('OK → parseia cep(8 digitos), uf(sigla), bairro, cidade, numero, precisao', async () => {
    stubFetch(respostaOK);
    const r = await geocodarGoogle('avenida afonso pena 342 belo horizonte');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const x = r.resultados[0];
      expect(x.lat).toBeCloseTo(-19.9245, 4);
      expect(x.lng).toBeCloseTo(-43.9352, 4);
      expect(x.cep).toBe('30130009');
      expect(x.uf).toBe('MG');
      expect(x.bairro).toBe('Centro');
      expect(x.cidade).toBe('Belo Horizonte');
      expect(x.numero).toBe('342');
      expect(x.logradouro).toBe('Avenida Afonso Pena');
      expect(x.precisao).toBe('ROOFTOP');
      expect(x.partial_match).toBe(false);
    }
  });

  it('envia components=country:BR, language pt-BR e a chave', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => respostaOK }));
    vi.stubGlobal('fetch', f as unknown as typeof fetch);
    await geocodarGoogle('rua x 10 sao paulo');
    const url = (f.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('components=country%3ABR');
    expect(url).toContain('language=pt-BR');
    expect(url).toContain('key=test-key');
  });

  it('aplica bias de localizacao quando lat/lng fornecidos', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => respostaOK }));
    vi.stubGlobal('fetch', f as unknown as typeof fetch);
    await geocodarGoogle('rua x', { lat: -19.9, lng: -43.9 });
    const url = (f.mock.calls[0] as unknown[])[0] as string;
    expect(url).toContain('location=-19.9%2C-43.9');
  });

  it('ZERO_RESULTS → zero_resultados', async () => {
    stubFetch({ status: 'ZERO_RESULTS', results: [] });
    const r = await geocodarGoogle('endereco que nao existe xyzzy');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('zero_resultados');
  });

  it('OVER_QUERY_LIMIT → over_limit', async () => {
    stubFetch({ status: 'OVER_QUERY_LIMIT' });
    const r = await geocodarGoogle('rua x 10 sao paulo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('over_limit');
  });

  it('REQUEST_DENIED → negado', async () => {
    stubFetch({ status: 'REQUEST_DENIED' });
    const r = await geocodarGoogle('rua x 10 sao paulo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('negado');
  });

  it('HTTP nao-ok → erro_rede', async () => {
    stubFetch({}, false, 500);
    const r = await geocodarGoogle('rua x 10 sao paulo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('erro_rede');
  });

  it('descarta CEP que nao tem 8 digitos', async () => {
    stubFetch({
      status: 'OK',
      results: [
        {
          formatted_address: 'Rua X, Sao Paulo - SP, Brasil',
          geometry: { location: { lat: -23.5, lng: -46.6 }, location_type: 'GEOMETRIC_CENTER' },
          address_components: [
            { long_name: 'Rua X', short_name: 'Rua X', types: ['route'] },
            { long_name: 'SP', short_name: 'SP', types: ['administrative_area_level_1'] },
            { long_name: '0131', short_name: '0131', types: ['postal_code'] },
          ],
        },
      ],
    });
    const r = await geocodarGoogle('rua x sao paulo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultados[0].cep).toBeUndefined();
  });
});

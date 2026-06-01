/**
 * Testes da API route POST /api/routing/geocodar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/routing/geocoding', () => ({
  geocodar: vi.fn(),
  geocodarVozComVariantes: vi.fn(),
}));

vi.mock('@/lib/cep/viacep', () => ({
  resolverCepDaRua: vi.fn(),
}));

import { GET, POST } from '@/app/api/routing/geocodar/route';
import { geocodar, geocodarVozComVariantes } from '@/lib/routing/geocoding';
import { resolverCepDaRua } from '@/lib/cep/viacep';
import { NextRequest } from 'next/server';

const vozMock = geocodarVozComVariantes as ReturnType<typeof vi.fn>;
const cepMock = resolverCepDaRua as ReturnType<typeof vi.fn>;

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/geocodar', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGet(q: string) {
  return new NextRequest(`http://localhost/api/routing/geocodar?q=${encodeURIComponent(q)}`);
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

describe('GET /api/routing/geocodar — CEP validado via ViaCEP (nao confia no Nominatim)', () => {
  function opcaoNominatim(over: Record<string, unknown> = {}) {
    return {
      lat: -19.92,
      lng: -43.94,
      endereco_normalizado: 'Avenida Afonso Pena, Belo Horizonte, MG',
      logradouro: 'Avenida Afonso Pena',
      bairro: undefined,
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30160909', // postcode LIXO do Nominatim — deve ser descartado
      ...over,
    };
  }

  it('substitui o postcode do Nominatim pelo CEP real (rua de 1 CEP)', async () => {
    vozMock.mockResolvedValue({ ok: true, resultados: [opcaoNominatim()] });
    cepMock.mockResolvedValue({ cep: '30130110', cepMultiplos: false });

    const res = await GET(makeGet('avenida afonso pena'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados[0].cep).toBe('30130110'); // nao o 30160909
    expect(body.resultados[0].cepMultiplos).toBe(false);
    expect(cepMock).toHaveBeenCalledWith({
      uf: 'MG',
      cidade: 'Belo Horizonte',
      logradouro: 'Avenida Afonso Pena',
      bairro: undefined,
    });
  });

  it('rua com varios CEPs → cep undefined + cepMultiplos true (descarta o lixo)', async () => {
    vozMock.mockResolvedValue({ ok: true, resultados: [opcaoNominatim()] });
    cepMock.mockResolvedValue({ cep: undefined, cepMultiplos: true });

    const res = await GET(makeGet('avenida afonso pena'));
    const body = await res.json();
    expect(body.resultados[0].cep).toBeUndefined();
    expect(body.resultados[0].cepMultiplos).toBe(true);
  });

  it('opcao sem logradouro/cidade NAO usa o postcode cru do Nominatim', async () => {
    vozMock.mockResolvedValue({
      ok: true,
      resultados: [opcaoNominatim({ logradouro: undefined, cidade: undefined, cep: '39140111' })],
    });

    const res = await GET(makeGet('algum lugar'));
    const body = await res.json();
    expect(body.resultados[0].cep).toBeUndefined();
    expect(cepMock).not.toHaveBeenCalled();
  });

  it('q ausente/curto → 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/routing/geocodar?q=ab'));
    expect(res.status).toBe(400);
  });

  it('erro_rede do geocoder → 503', async () => {
    vozMock.mockResolvedValue({ ok: false, motivo: 'erro_rede' });
    const res = await GET(makeGet('rua teste teste'));
    expect(res.status).toBe(503);
  });
});

describe('POST /api/routing/geocodar — sucesso', () => {
  it('200 com lat/lng/endereco_normalizado', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      resultado: {
        lat: -23.561,
        lng: -46.6565,
        endereco_normalizado: 'Avenida Paulista, Sao Paulo, SP, Brasil',
      },
    });

    const res = await POST(makeReq({ endereco: 'Avenida Paulista, 1500, SP' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resultado.lat).toBe(-23.561);
    expect(body.resultado.lng).toBe(-46.6565);
    expect(geocodar).toHaveBeenCalledWith('Avenida Paulista, 1500, SP');
  });
});

describe('POST /api/routing/geocodar — validacao 400', () => {
  it('JSON invalido → 400 json_invalido', async () => {
    const res = await POST(makeReq('{ nao e json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('json_invalido');
  });

  it('endereco faltando → 400 campo_obrigatorio', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('campo_obrigatorio');
  });

  it('endereco nao-string → 400', async () => {
    const res = await POST(makeReq({ endereco: 123 }));
    expect(res.status).toBe(400);
  });

  it('endereco_invalido do geocoder → 400', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'endereco_invalido',
    });
    const res = await POST(makeReq({ endereco: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('nao_encontrado do geocoder → 400', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'nao_encontrado',
    });
    const res = await POST(makeReq({ endereco: 'rua que nao existe xyz' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/routing/geocodar — erro 503', () => {
  it('erro_rede → 503', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'erro_rede',
    });
    const res = await POST(makeReq({ endereco: 'X teste teste' }));
    expect(res.status).toBe(503);
  });

  it('timeout → 503', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'timeout',
    });
    const res = await POST(makeReq({ endereco: 'X teste teste' }));
    expect(res.status).toBe(503);
  });
});

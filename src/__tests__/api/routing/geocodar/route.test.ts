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

vi.mock('@/lib/routing/googleGeocoding', () => ({
  geocodarGoogle: vi.fn(),
}));

vi.mock('@/lib/routing/geocodeCache', () => ({
  lerGeocodeCache: vi.fn(),
  gravarGeocodeCache: vi.fn(),
  consumirCota: vi.fn(),
  montarQueryEstruturada: (e: Record<string, string | undefined>) =>
    [e.logradouro, e.numero, e.cidade].filter(Boolean).join(', '),
}));

import { GET, POST } from '@/app/api/routing/geocodar/route';
import { geocodar, geocodarVozComVariantes } from '@/lib/routing/geocoding';
import { resolverCepDaRua } from '@/lib/cep/viacep';
import { geocodarGoogle } from '@/lib/routing/googleGeocoding';
import { lerGeocodeCache, gravarGeocodeCache, consumirCota } from '@/lib/routing/geocodeCache';
import { NextRequest } from 'next/server';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

const vozMock = geocodarVozComVariantes as ReturnType<typeof vi.fn>;
const cepMock = resolverCepDaRua as ReturnType<typeof vi.fn>;
const googleMock = geocodarGoogle as ReturnType<typeof vi.fn>;
const cacheLerMock = lerGeocodeCache as ReturnType<typeof vi.fn>;
const cacheGravarMock = gravarGeocodeCache as ReturnType<typeof vi.fn>;
const cotaMock = consumirCota as ReturnType<typeof vi.fn>;

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
  // Defaults: cache miss + sem chave Google → caminho de fallback (Nominatim+ViaCEP).
  cacheLerMock.mockResolvedValue(null);
  cacheGravarMock.mockResolvedValue(undefined);
  cotaMock.mockResolvedValue({ permitido: true, total: 1 });
  delete process.env.GOOGLE_MAPS_API_KEY;
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
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

describe('GET /api/routing/geocodar — Google + cache (Etapa 2)', () => {
  const fallbackResultados = [
    {
      lat: -19.92, lng: -43.94, endereco_normalizado: 'X', logradouro: 'Rua X',
      bairro: 'B', cidade: 'Contagem', uf: 'MG',
    },
  ];

  it('cache HIT → devolve do cache, NAO chama Google nem Nominatim', async () => {
    cacheLerMock.mockResolvedValue({
      lat: -19.92, lng: -43.93, cep: '30130009', logradouro: 'Avenida Afonso Pena',
      numero: '342', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG',
      precisao: 'ROOFTOP', endereco_formatado: 'Av. Afonso Pena, 342',
    });

    const res = await GET(makeGet('avenida afonso pena 342'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fonte).toBe('cache');
    expect(body.resultados[0].cep).toBe('30130009');
    expect(googleMock).not.toHaveBeenCalled();
    expect(vozMock).not.toHaveBeenCalled();
  });

  it('com chave + cota OK + Google OK → usa Google (cep exato), cacheia, NAO usa fallback', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    googleMock.mockResolvedValue({
      ok: true,
      resultados: [
        {
          lat: -19.9245, lng: -43.9352, cep: '30130009', logradouro: 'Avenida Afonso Pena',
          numero: '342', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG',
          precisao: 'ROOFTOP', endereco_formatado: 'Av. Afonso Pena, 342',
        },
      ],
    });

    const res = await GET(makeGet('avenida afonso pena 342'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fonte).toBe('google');
    expect(body.resultados[0].cep).toBe('30130009');
    expect(body.resultados[0].numero).toBe('342');
    expect(cacheGravarMock).toHaveBeenCalled(); // cacheia sob a chave da consulta + estruturada
    expect(vozMock).not.toHaveBeenCalled();
  });

  it('cota ESTOURADA → cai no fallback (Nominatim+ViaCEP), nem chama o Google', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    cotaMock.mockResolvedValue({ permitido: false, total: 38000 });
    vozMock.mockResolvedValue({ ok: true, resultados: fallbackResultados });
    cepMock.mockResolvedValue({ cep: '32180650', cepMultiplos: false });

    const res = await GET(makeGet('rua x contagem'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fonte).toBeUndefined(); // fallback nao marca fonte
    expect(googleMock).not.toHaveBeenCalled();
    expect(vozMock).toHaveBeenCalledOnce();
  });

  it('Google sem resultado → cai no fallback', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'k';
    googleMock.mockResolvedValue({ ok: false, motivo: 'zero_resultados' });
    vozMock.mockResolvedValue({ ok: true, resultados: fallbackResultados });
    cepMock.mockResolvedValue({ cep: undefined, cepMultiplos: true });

    const res = await GET(makeGet('rua x contagem'));
    expect(res.status).toBe(200);
    expect(vozMock).toHaveBeenCalledOnce();
  });

  it('sem chave Google → vai direto pro fallback (nao chama Google nem consome cota)', async () => {
    vozMock.mockResolvedValue({ ok: true, resultados: fallbackResultados });
    cepMock.mockResolvedValue({ cep: '32180650', cepMultiplos: false });

    const res = await GET(makeGet('rua x contagem'));
    expect(res.status).toBe(200);
    expect(googleMock).not.toHaveBeenCalled();
    expect(cotaMock).not.toHaveBeenCalled();
    expect(vozMock).toHaveBeenCalledOnce();
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

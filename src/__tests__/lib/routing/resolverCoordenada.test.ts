/**
 * Testes do resolver de coordenada — valida a PRIORIDADE:
 *   aprendida (frota) > Overpass confirmado > Nominatim (centro da rua).
 * Mocka as 3 fontes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  lerAprendida: vi.fn(),
  geocodarComFallback: vi.fn(),
  validarNumero: vi.fn(),
  resolverGoogle: vi.fn(),
}));

vi.mock('@/lib/routing/coordsAprendidas', () => ({
  lerCoordAprendida: mocks.lerAprendida,
}));
vi.mock('@/lib/routing/geocoding', () => ({
  geocodarComFallback: mocks.geocodarComFallback,
}));
vi.mock('@/lib/routing/geocodeCache', () => ({
  resolverGoogleCacheado: mocks.resolverGoogle,
  montarQueryEstruturada: (e: Record<string, string | undefined>) =>
    [e.logradouro, e.numero, e.cidade].filter(Boolean).join(', '),
}));
vi.mock('@/lib/routing/overpass/validar', () => ({
  validarNumero: mocks.validarNumero,
}));

import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';

const P = {
  empresa_id: 'emp-1',
  logradouro: 'Rua Piatã',
  numero: '104',
  bairro: 'São Mateus',
  cidade: 'Contagem',
  uf: 'MG',
  cep: '32180300',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Default: Google sem resultado (cache miss / sem chave) → fluxo Nominatim.
  mocks.resolverGoogle.mockResolvedValue(null);
});

describe('resolverCoordenada — prioridade', () => {
  it('1) coord aprendida vence tudo (nem geocoda, nem Google)', async () => {
    mocks.lerAprendida.mockResolvedValue({ lat: -19.8612, lng: -44.0291, amostras: 4 });

    const r = await resolverCoordenada(P);

    expect(r).toEqual({ lat: -19.8612, lng: -44.0291, confianca: 'alta', fonte: 'aprendida' });
    expect(mocks.resolverGoogle).not.toHaveBeenCalled();
    expect(mocks.geocodarComFallback).not.toHaveBeenCalled();
    expect(mocks.validarNumero).not.toHaveBeenCalled();
  });

  it('1.5) sem aprendida + Google ROOFTOP via API → fonte google_api, alta, curto-circuita', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.resolverGoogle.mockResolvedValue({
      resultado: { lat: -19.9245, lng: -43.9352, precisao: 'ROOFTOP', endereco_formatado: 'x' },
      fonte: 'google', // veio da API
    });

    const r = await resolverCoordenada(P);

    expect(r).toEqual({ lat: -19.9245, lng: -43.9352, confianca: 'alta', fonte: 'google_api' });
    // Nem Nominatim nem Overpass rodam — Google ja cravou.
    expect(mocks.geocodarComFallback).not.toHaveBeenCalled();
    expect(mocks.validarNumero).not.toHaveBeenCalled();
  });

  it('1.6) Google do CACHE → fonte google_cache (verde)', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.resolverGoogle.mockResolvedValue({
      resultado: { lat: -19.9245, lng: -43.9352, precisao: 'RANGE_INTERPOLATED', endereco_formatado: 'x' },
      fonte: 'cache',
    });

    const r = await resolverCoordenada(P);

    expect(r?.fonte).toBe('google_cache');
    expect(r?.confianca).toBe('alta');
  });

  it('Google APPROXIMATE (coord grosseira) → ignora e cai pro Nominatim', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.resolverGoogle.mockResolvedValue({
      resultado: { lat: -19.9, lng: -43.9, precisao: 'APPROXIMATE', endereco_formatado: 'x' },
      fonte: 'google',
    });
    mocks.geocodarComFallback.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.86, lng: -44.02, endereco_normalizado: 'x' },
      tentativa: 1,
    });
    mocks.validarNumero.mockResolvedValue({
      status: 'sem_dados', coordenada: null, mensagem: '', dados: { quantidade: 0, min: null, max: null, numeros: [], confianca: 'sem_dados' }, cacheado: false,
    });

    const r = await resolverCoordenada(P);

    expect(r?.fonte).toBe('nominatim');
    expect(mocks.geocodarComFallback).toHaveBeenCalled();
  });

  it('2) sem aprendida + Overpass confirmado → coord do Overpass, alta', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.geocodarComFallback.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.86, lng: -44.02, endereco_normalizado: 'Rua Piatã, Contagem' },
      tentativa: 1,
    });
    mocks.validarNumero.mockResolvedValue({
      status: 'confirmado',
      coordenada: { lat: -19.8615, lng: -44.0297 },
      mensagem: 'ok',
      dados: { quantidade: 120, min: 1, max: 999, numeros: [], confianca: 'alta' },
      cacheado: false,
    });

    const r = await resolverCoordenada(P);

    expect(r).toEqual({
      lat: -19.8615,
      lng: -44.0297,
      confianca: 'alta',
      fonte: 'overpass',
    });
  });

  it('3) Overpass nao confirma → fica com Nominatim, baixa', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.geocodarComFallback.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.86, lng: -44.02, endereco_normalizado: 'Rua Piatã, Contagem' },
      tentativa: 1,
    });
    mocks.validarNumero.mockResolvedValue({
      status: 'sem_dados',
      coordenada: null,
      mensagem: 'sem cobertura',
      dados: { quantidade: 0, min: null, max: null, numeros: [], confianca: 'sem_dados' },
      cacheado: false,
    });

    const r = await resolverCoordenada(P);

    expect(r).toEqual({ lat: -19.86, lng: -44.02, confianca: 'baixa', fonte: 'nominatim' });
  });

  it('Nominatim falha → null (nem o Overpass roda)', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.geocodarComFallback.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const r = await resolverCoordenada(P);

    expect(r).toBeNull();
    expect(mocks.validarNumero).not.toHaveBeenCalled();
  });

  it('Overpass lanca excecao → cai pro Nominatim (best-effort, nao quebra)', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.geocodarComFallback.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.86, lng: -44.02, endereco_normalizado: 'x' },
      tentativa: 1,
    });
    mocks.validarNumero.mockRejectedValue(new Error('overpass down'));

    const r = await resolverCoordenada(P);

    expect(r).toEqual({ lat: -19.86, lng: -44.02, confianca: 'baixa', fonte: 'nominatim' });
  });

  it('sem numero → nao chama Overpass, usa Nominatim direto', async () => {
    mocks.lerAprendida.mockResolvedValue(null);
    mocks.geocodarComFallback.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.86, lng: -44.02, endereco_normalizado: 'x' },
      tentativa: 1,
    });

    const r = await resolverCoordenada({ ...P, numero: undefined });

    expect(r?.fonte).toBe('nominatim');
    expect(mocks.validarNumero).not.toHaveBeenCalled();
  });
});

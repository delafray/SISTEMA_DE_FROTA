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
}));

vi.mock('@/lib/routing/coordsAprendidas', () => ({
  lerCoordAprendida: mocks.lerAprendida,
}));
vi.mock('@/lib/routing/geocoding', () => ({
  geocodarComFallback: mocks.geocodarComFallback,
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
});

describe('resolverCoordenada — prioridade', () => {
  it('1) coord aprendida vence tudo (nem geocoda)', async () => {
    mocks.lerAprendida.mockResolvedValue({ lat: -19.8612, lng: -44.0291, amostras: 4 });

    const r = await resolverCoordenada(P);

    expect(r).toEqual({ lat: -19.8612, lng: -44.0291, confianca: 'alta', fonte: 'aprendida' });
    expect(mocks.geocodarComFallback).not.toHaveBeenCalled();
    expect(mocks.validarNumero).not.toHaveBeenCalled();
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

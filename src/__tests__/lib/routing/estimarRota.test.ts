/**
 * Testes do utilitario estimarRota (CEP → endereco → coord → OSRM).
 * Mocka todas as 3 camadas (viacep, geocoding, osrm).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cep/viacep', () => ({
  consultarCEP: vi.fn(),
}));

vi.mock('@/lib/routing/geocoding', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/routing/geocoding')>('@/lib/routing/geocoding');
  return { ...actual, geocodar: vi.fn() };
});

vi.mock('@/lib/routing/osrm', () => ({
  calcularRotaSimples: vi.fn(),
}));

import { estimarRota } from '@/lib/routing/estimarRota';
import { consultarCEP } from '@/lib/cep/viacep';
import { geocodar } from '@/lib/routing/geocoding';
import { calcularRotaSimples } from '@/lib/routing/osrm';

const cepMock = consultarCEP as ReturnType<typeof vi.fn>;
const geoMock = geocodar as ReturnType<typeof vi.fn>;
const osrmMock = calcularRotaSimples as ReturnType<typeof vi.fn>;

function input() {
  return {
    origem: { cep: '01310100', numero: '1500' },
    destino: { cep: '13083970', numero: '100' },
  };
}

function ok<T>(v: T) {
  return { ok: true, ...v } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estimarRota — sucesso', () => {
  it('pipeline completo: cep+endereco → coord → osrm km/polyline', async () => {
    cepMock
      .mockResolvedValueOnce(
        ok({
          cep: '01310100',
          endereco: { logradouro: 'Av Paulista', bairro: 'B', cidade: 'SP', uf: 'SP' },
          fonte: 'cache',
        })
      )
      .mockResolvedValueOnce(
        ok({
          cep: '13083970',
          endereco: { logradouro: 'R Univ', bairro: 'B', cidade: 'Campinas', uf: 'SP' },
          fonte: 'cache',
        })
      );
    geoMock
      .mockResolvedValueOnce(
        ok({ resultado: { lat: -23.561, lng: -46.6565, endereco_normalizado: 'Av Paulista, SP' } })
      )
      .mockResolvedValueOnce(
        ok({ resultado: { lat: -22.9, lng: -47.06, endereco_normalizado: 'Campinas, SP' } })
      );
    osrmMock.mockResolvedValue(
      ok({ rota: { distanciaKm: 95, tempoMin: 70, polyline: 'abc' } })
    );

    const r = await estimarRota(input());

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.km_estimado).toBe(95);
      expect(r.tempo_min).toBe(70);
      expect(r.polyline).toBe('abc');
      expect(r.origem).toEqual({ lat: -23.561, lng: -46.6565 });
      expect(r.destino).toEqual({ lat: -22.9, lng: -47.06 });
    }
  });
});

describe('estimarRota — falhas em cascata', () => {
  it('cep origem invalido → motivo cep_origem_invalido', async () => {
    cepMock
      .mockResolvedValueOnce({ ok: false, motivo: 'cep_invalido' })
      .mockResolvedValueOnce({ ok: true, cep: '13083970', endereco: { logradouro: 'X', bairro: '', cidade: 'C', uf: 'SP' }, fonte: 'cache' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'cep_origem_invalido' });
    // OSRM nem geocoding chamados
    expect(geoMock).not.toHaveBeenCalled();
    expect(osrmMock).not.toHaveBeenCalled();
  });

  it('cep destino invalido → motivo cep_destino_invalido', async () => {
    cepMock
      .mockResolvedValueOnce({ ok: true, cep: '01310100', endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' }, fonte: 'cache' })
      .mockResolvedValueOnce({ ok: false, motivo: 'nao_encontrado' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'cep_destino_invalido' });
  });

  it('geocoding origem falha → motivo geocoding_origem_falhou', async () => {
    cepMock
      .mockResolvedValue(ok({ cep: 'X', endereco: { logradouro: 'A', bairro: '', cidade: 'C', uf: 'SP' }, fonte: 'cache' }));
    geoMock.mockResolvedValueOnce({ ok: false, motivo: 'erro_rede' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'geocoding_origem_falhou' });
    expect(osrmMock).not.toHaveBeenCalled();
  });

  it('geocoding destino falha → motivo geocoding_destino_falhou', async () => {
    cepMock.mockResolvedValue(ok({ cep: 'X', endereco: { logradouro: 'A', bairro: '', cidade: 'C', uf: 'SP' }, fonte: 'cache' }));
    geoMock
      .mockResolvedValueOnce(ok({ resultado: { lat: 0, lng: 0, endereco_normalizado: 'X' } }))
      .mockResolvedValueOnce({ ok: false, motivo: 'nao_encontrado' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'geocoding_destino_falhou' });
  });

  it('config_faltando do OSRM → motivo config_faltando', async () => {
    cepMock.mockResolvedValue(ok({ cep: 'X', endereco: { logradouro: 'A', bairro: '', cidade: 'C', uf: 'SP' }, fonte: 'cache' }));
    geoMock.mockResolvedValue(ok({ resultado: { lat: 0, lng: 0, endereco_normalizado: 'X' } }));
    osrmMock.mockResolvedValue({ ok: false, motivo: 'config_faltando' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'config_faltando' });
  });

  it('osrm sem_rota → motivo rota_falhou', async () => {
    cepMock.mockResolvedValue(ok({ cep: 'X', endereco: { logradouro: 'A', bairro: '', cidade: 'C', uf: 'SP' }, fonte: 'cache' }));
    geoMock.mockResolvedValue(ok({ resultado: { lat: 0, lng: 0, endereco_normalizado: 'X' } }));
    osrmMock.mockResolvedValue({ ok: false, motivo: 'sem_rota' });

    const r = await estimarRota(input());

    expect(r).toEqual({ ok: false, motivo: 'rota_falhou' });
  });
});

/**
 * Testes de coordenadas aprendidas pela frota.
 * Mocka Supabase; usa normalizarRua real (via chaveEndereco).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import {
  chaveEndereco,
  lerCoordAprendida,
  gravarCoordAprendida,
} from '@/lib/routing/coordsAprendidas';

const ENDERECO = { logradouro: 'Rua Piatã', numero: '104', cidade: 'Contagem', uf: 'MG' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('chaveEndereco', () => {
  it('monta "ruaNorm|numero|cidade|uf" com cidade lower e uf upper', () => {
    const chave = chaveEndereco(ENDERECO);
    expect(chave).not.toBeNull();
    expect(chave!.endsWith('|104|contagem|MG')).toBe(true);
  });

  it('extrai so o primeiro numero puro ("104A" → "104")', () => {
    const chave = chaveEndereco({ ...ENDERECO, numero: '104A' });
    expect(chave!.endsWith('|104|contagem|MG')).toBe(true);
  });

  it('null quando falta numero', () => {
    expect(chaveEndereco({ ...ENDERECO, numero: '' })).toBeNull();
    expect(chaveEndereco({ ...ENDERECO, numero: 'SN' })).toBeNull();
  });

  it('null quando falta logradouro/cidade/uf', () => {
    expect(chaveEndereco({ ...ENDERECO, logradouro: '' })).toBeNull();
    expect(chaveEndereco({ ...ENDERECO, cidade: '' })).toBeNull();
    expect(chaveEndereco({ ...ENDERECO, uf: '' })).toBeNull();
  });
});

/** Mock do select().eq().eq().maybeSingle() pra leitura. */
function mockSelect(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

describe('lerCoordAprendida', () => {
  it('retorna null pra chave invalida (sem chamar supabase)', async () => {
    const r = await lerCoordAprendida('emp-1', { ...ENDERECO, numero: '' });
    expect(r).toBeNull();
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('retorna coord quando existe', async () => {
    supabaseFromMock.mockReturnValue(
      mockSelect({ data: { lat: -19.861, lng: -44.029, amostras: 3 }, error: null })
    );
    const r = await lerCoordAprendida('emp-1', ENDERECO);
    expect(r).toEqual({ lat: -19.861, lng: -44.029, amostras: 3 });
  });

  it('retorna null quando nao existe', async () => {
    supabaseFromMock.mockReturnValue(mockSelect({ data: null, error: null }));
    const r = await lerCoordAprendida('emp-1', ENDERECO);
    expect(r).toBeNull();
  });

  it('retorna null em erro de DB (nao lanca)', async () => {
    supabaseFromMock.mockReturnValue(mockSelect({ data: null, error: { message: 'boom' } }));
    const r = await lerCoordAprendida('emp-1', ENDERECO);
    expect(r).toBeNull();
  });
});

describe('gravarCoordAprendida', () => {
  it('nao grava com chave invalida', async () => {
    await gravarCoordAprendida('emp-1', { ...ENDERECO, numero: '' }, -19.86, -44.02);
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('nao grava com lat/lng nao finitos', async () => {
    await gravarCoordAprendida('emp-1', ENDERECO, NaN, -44.02);
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('primeira amostra: grava a coord crua com amostras=1', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    // 1a chamada (leitura, dentro do gravar) → null; 2a (upsert)
    supabaseFromMock
      .mockReturnValueOnce(mockSelect({ data: null, error: null }))
      .mockReturnValueOnce({ upsert });

    await gravarCoordAprendida('emp-1', ENDERECO, -19.861, -44.029);

    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0] as { lat: number; lng: number; amostras: number };
    expect(payload.lat).toBe(-19.861);
    expect(payload.lng).toBe(-44.029);
    expect(payload.amostras).toBe(1);
  });

  it('amostra subsequente: media ponderada com a anterior', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    // leitura devolve coord existente (1 amostra) → media simples (a+b)/2
    supabaseFromMock
      .mockReturnValueOnce(mockSelect({ data: { lat: 0, lng: 0, amostras: 1 }, error: null }))
      .mockReturnValueOnce({ upsert });

    await gravarCoordAprendida('emp-1', ENDERECO, 10, 20);

    const payload = upsert.mock.calls[0][0] as { lat: number; lng: number; amostras: number };
    // peso=1: (0*1 + 10)/2 = 5 ; (0*1 + 20)/2 = 10
    expect(payload.lat).toBe(5);
    expect(payload.lng).toBe(10);
    expect(payload.amostras).toBe(2);
  });
});

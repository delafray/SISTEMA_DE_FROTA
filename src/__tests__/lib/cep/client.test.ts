/**
 * Testes do browser client de CEP (`src/lib/cep/client.ts`).
 * Mocka fetch global, valida que chama /api/cep/{cep} normalizado e mapeia resultado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consultarCEPBrowser } from '@/lib/cep/client';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consultarCEPBrowser — validacao', () => {
  it('rejeita CEP invalido sem chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await consultarCEPBrowser('123');

    expect(r).toEqual({ ok: false, motivo: 'cep_invalido' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza CEP com hifen antes de chamar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        cep: '01310100',
        endereco: { logradouro: 'Av', bairro: 'B', cidade: 'SP', uf: 'SP' },
        fonte: 'cache',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await consultarCEPBrowser('01310-100');

    expect(fetchMock).toHaveBeenCalledWith('/api/cep/01310100');
  });
});

describe('consultarCEPBrowser — sucesso', () => {
  it('retorna ResultadoCEP do body em 200', async () => {
    const body = {
      ok: true,
      cep: '01310100',
      endereco: { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP' },
      fonte: 'api' as const,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }));

    const r = await consultarCEPBrowser('01310100');

    expect(r).toEqual(body);
  });
});

describe('consultarCEPBrowser — erros', () => {
  it('retorna body de erro mesmo em 400 (API serializa ResultadoCEP no body)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, motivo: 'nao_encontrado' }),
    }));

    const r = await consultarCEPBrowser('99999999');

    expect(r).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('retorna erro_rede quando fetch rejeita', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const r = await consultarCEPBrowser('01310100');

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });
});

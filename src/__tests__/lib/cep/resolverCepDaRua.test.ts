/**
 * Testes de resolverCepDaRua — busca reversa do ViaCEP (UF/cidade/logradouro)
 * pra achar o CEP REAL da rua, em vez de confiar no postcode (lixo) do Nominatim.
 *
 * Regras: 1 CEP unico → devolve; varios → cepMultiplos (sem chutar); bairro
 * narrowou pra 1 → devolve o do bairro; rua nao achada/erro → vazio.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolverCepDaRua } from '@/lib/cep/viacep';

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => impl(),
    })) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolverCepDaRua', () => {
  it('rua com 1 CEP unico → devolve o CEP (8 digitos, sem hifen)', async () => {
    stubFetch(async () => [
      { cep: '30130-110', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG' },
    ]);

    const r = await resolverCepDaRua({ uf: 'MG', cidade: 'Belo Horizonte', logradouro: 'Avenida Afonso Pena' });
    expect(r).toEqual({ cep: '30130110', cepMultiplos: false });
  });

  it('rua com VARIOS CEPs e sem bairro → cepMultiplos, sem chutar', async () => {
    stubFetch(async () => [
      { cep: '30130-110', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG' },
      { cep: '30130-009', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG' },
      { cep: '30150-260', logradouro: 'Avenida Afonso Pena', bairro: 'Funcionários', localidade: 'Belo Horizonte', uf: 'MG' },
    ]);

    const r = await resolverCepDaRua({ uf: 'MG', cidade: 'Belo Horizonte', logradouro: 'Avenida Afonso Pena' });
    expect(r).toEqual({ cep: undefined, cepMultiplos: true });
  });

  it('varios CEPs mas o BAIRRO falado crava 1 → devolve o CEP do bairro', async () => {
    stubFetch(async () => [
      { cep: '30130-110', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG' },
      { cep: '30150-260', logradouro: 'Avenida Afonso Pena', bairro: 'Funcionários', localidade: 'Belo Horizonte', uf: 'MG' },
    ]);

    const r = await resolverCepDaRua({
      uf: 'MG',
      cidade: 'Belo Horizonte',
      logradouro: 'Avenida Afonso Pena',
      bairro: 'Funcionarios', // sem acento — normalizacao casa
    });
    expect(r).toEqual({ cep: '30150260', cepMultiplos: false });
  });

  it('ignora ruas DIFERENTES que o ViaCEP traz no LIKE (Afonso Pena Junior)', async () => {
    stubFetch(async () => [
      { cep: '30130-110', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG' },
      { cep: '31000-000', logradouro: 'Rua Afonso Pena Junior', bairro: 'Outro', localidade: 'Belo Horizonte', uf: 'MG' },
    ]);

    const r = await resolverCepDaRua({ uf: 'MG', cidade: 'Belo Horizonte', logradouro: 'Afonso Pena' });
    // So a "Afonso Pena" exata conta → 1 unico
    expect(r).toEqual({ cep: '30130110', cepMultiplos: false });
  });

  it('rua nao encontrada (ViaCEP devolve []) → vazio', async () => {
    stubFetch(async () => []);
    const r = await resolverCepDaRua({ uf: 'MG', cidade: 'Contagem', logradouro: 'Rua Que Nao Existe' });
    expect(r).toEqual({ cep: undefined, cepMultiplos: false });
  });

  it('resposta nao-array (erro do ViaCEP) → vazio', async () => {
    stubFetch(async () => ({ erro: true }));
    const r = await resolverCepDaRua({ uf: 'SP', cidade: 'Sao Paulo', logradouro: 'Rua Augusta' });
    expect(r).toEqual({ cep: undefined, cepMultiplos: false });
  });

  it('erro de rede → vazio (nunca lanca)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch);
    const r = await resolverCepDaRua({ uf: 'SP', cidade: 'Sao Paulo', logradouro: 'Rua Augusta' });
    expect(r).toEqual({ cep: undefined, cepMultiplos: false });
  });

  it('parametros insuficientes (UF != 2, cidade/rua curtas) → nao chama o ViaCEP', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f as unknown as typeof fetch);

    expect(await resolverCepDaRua({ uf: 'M', cidade: 'BH', logradouro: 'X' }))
      .toEqual({ cep: undefined, cepMultiplos: false });
    expect(f).not.toHaveBeenCalled();
  });
});

/**
 * Testes da camada de dados dos cadastros de API (email + final do cartão).
 * Mocka o client do Supabase; usa a cripto real (com chave de teste) pra provar
 * que o que vai pro banco está cifrado e volta decifrado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upsertMock = vi.fn();
const selectMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: (...a: unknown[]) => upsertMock(...a),
      select: (...a: unknown[]) => selectMock(...a),
    }),
  }),
}));

import {
  salvarCadastro,
  lerCadastros,
  cartaoFinalValido,
} from '@/lib/apis/apiCadastros';
import { cifrar, decifrar } from '@/lib/apis/cripto';
import { CATALOGO_APIS } from '@/lib/apis/catalogoApis';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('USO_APIS_ENC_KEY', 'chave-de-teste-super-secreta-999');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake');
  upsertMock.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cartaoFinalValido', () => {
  it('aceita vazio/null (campo opcional)', () => {
    expect(cartaoFinalValido(null)).toBe(true);
    expect(cartaoFinalValido('')).toBe(true);
  });
  it('aceita exatamente 4 dígitos', () => {
    expect(cartaoFinalValido('4242')).toBe(true);
  });
  it('rejeita comprimento errado ou não-numérico', () => {
    expect(cartaoFinalValido('12')).toBe(false);
    expect(cartaoFinalValido('12345')).toBe(false);
    expect(cartaoFinalValido('abcd')).toBe(false);
  });
});

describe('salvarCadastro', () => {
  it('rejeita apiId que não existe no catálogo (não grava)', async () => {
    const r = await salvarCadastro({ apiId: 'servico_inexistente', email: 'a@b.com', cartaoFinal: null, observacao: null });
    expect(r.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejeita final de cartão inválido (não grava)', async () => {
    const r = await salvarCadastro({ apiId: 'gemini', email: null, cartaoFinal: '12', observacao: null });
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/4 dígitos/) });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('grava email e cartão CIFRADOS (decifram de volta ao original)', async () => {
    const r = await salvarCadastro({
      apiId: 'gemini',
      email: 'ronaldo@gmail.com',
      cartaoFinal: '4242',
      observacao: 'cartão da empresa',
    });
    expect(r).toEqual({ ok: true });

    const [obj, opts] = upsertMock.mock.calls[0];
    expect(obj.api_id).toBe('gemini');
    expect(obj.observacao).toBe('cartão da empresa');
    // Não vai texto puro pro banco:
    expect(obj.email_cifrado).not.toContain('ronaldo');
    expect(obj.cartao_cifrado).not.toContain('4242');
    // Mas decifra de volta:
    expect(decifrar(obj.email_cifrado)).toBe('ronaldo@gmail.com');
    expect(decifrar(obj.cartao_cifrado)).toBe('4242');
    expect(opts).toEqual({ onConflict: 'api_id' });
  });

  it('campos vazios viram null (não cifra string vazia)', async () => {
    await salvarCadastro({ apiId: 'openai', email: '  ', cartaoFinal: '', observacao: '' });
    const [obj] = upsertMock.mock.calls[0];
    expect(obj.email_cifrado).toBeNull();
    expect(obj.cartao_cifrado).toBeNull();
    expect(obj.observacao).toBeNull();
  });

  it('propaga erro do banco como falha amigável', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'boom' } });
    const r = await salvarCadastro({ apiId: 'gemini', email: 'a@b.com', cartaoFinal: null, observacao: null });
    expect(r.ok).toBe(false);
  });
});

describe('lerCadastros', () => {
  it('decifra email/cartão das linhas do banco', async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          api_id: 'gemini',
          email_cifrado: cifrar('conta@frota.com'),
          cartao_cifrado: cifrar('1234'),
          observacao: 'nota',
        },
      ],
      error: null,
    });

    const mapa = await lerCadastros();
    expect(mapa.gemini).toEqual({
      apiId: 'gemini',
      email: 'conta@frota.com',
      cartaoFinal: '1234',
      observacao: 'nota',
    });
  });

  it('tolera campo que não decifra (devolve null nele, sem quebrar)', async () => {
    selectMock.mockResolvedValue({
      data: [{ api_id: 'gemini', email_cifrado: 'lixo-nao-cifrado', cartao_cifrado: null, observacao: null }],
      error: null,
    });
    const mapa = await lerCadastros();
    expect(mapa.gemini.email).toBeNull();
    expect(mapa.gemini.cartaoFinal).toBeNull();
  });

  it('erro de banco → mapa vazio (não derruba a página)', async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: 'db down' } });
    expect(await lerCadastros()).toEqual({});
  });
});

describe('catálogo — serviços públicos sem cadastro', () => {
  const byId = Object.fromEntries(CATALOGO_APIS.map((a) => [a.id, a]));
  it('Nominatim e ViaCEP marcados como semCadastro', () => {
    expect(byId.nominatim.semCadastro).toBe(true);
    expect(byId.viacep.semCadastro).toBe(true);
  });
  it('serviços com conta NÃO são semCadastro', () => {
    expect(byId.gemini.semCadastro).toBeUndefined();
    expect(byId.openai.semCadastro).toBeUndefined();
  });
});

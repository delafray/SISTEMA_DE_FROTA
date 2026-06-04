/**
 * Testes da criptografia AES-256-GCM dos cadastros sensíveis de /uso-apis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cifrar, decifrar } from '@/lib/apis/cripto';

beforeEach(() => {
  vi.stubEnv('USO_APIS_ENC_KEY', 'frase-secreta-de-teste-bem-longa-123456');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cripto (AES-256-GCM)', () => {
  it('round-trip: decifrar(cifrar(x)) === x', () => {
    const txt = 'ronaldo@gmail.com';
    expect(decifrar(cifrar(txt))).toBe(txt);
  });

  it('preserva acentos e caracteres especiais', () => {
    const txt = 'João — cartão 4242 · conta@empresa.com.br';
    expect(decifrar(cifrar(txt))).toBe(txt);
  });

  it('cada cifra usa IV novo → ciphertext diferente pro mesmo texto', () => {
    expect(cifrar('1234')).not.toBe(cifrar('1234'));
  });

  it('blob adulterado lança (o GCM autentica)', () => {
    const blob = cifrar('segredo');
    const raw = Buffer.from(blob, 'base64');
    raw[15] = raw[15] ^ 0xff; // vira um byte na região da authTag
    expect(() => decifrar(raw.toString('base64'))).toThrow();
  });

  it('blob curto demais é rejeitado', () => {
    expect(() => decifrar(Buffer.from('curto').toString('base64'))).toThrow();
  });

  it('sem USO_APIS_ENC_KEY → lança ao cifrar', () => {
    vi.unstubAllEnvs();
    expect(() => cifrar('x')).toThrow(/USO_APIS_ENC_KEY/);
  });
});

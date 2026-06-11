import { describe, it, expect } from 'vitest';
import { normalizarCEP, formatarCEPDigitando } from '@/lib/cep/formatarCEP';

describe('normalizarCEP', () => {
  it('remove hifen e devolve so digitos', () => {
    expect(normalizarCEP('01310-100')).toBe('01310100');
  });

  it('string ja normalizada passa sem alteracao', () => {
    expect(normalizarCEP('01310100')).toBe('01310100');
  });

  it('remove espacos e outros caracteres nao numericos', () => {
    expect(normalizarCEP('01310 100')).toBe('01310100');
    expect(normalizarCEP('CEP: 01310-100')).toBe('01310100');
  });

  it('string vazia devolve string vazia', () => {
    expect(normalizarCEP('')).toBe('');
  });

  it('sem digitos devolve string vazia', () => {
    expect(normalizarCEP('abc-def')).toBe('');
  });
});

describe('formatarCEPDigitando', () => {
  it('string vazia devolve string vazia', () => {
    expect(formatarCEPDigitando('')).toBe('');
  });

  it('ate 5 digitos devolve sem hifen', () => {
    expect(formatarCEPDigitando('01310')).toBe('01310');
    expect(formatarCEPDigitando('013')).toBe('013');
  });

  it('6 digitos insere hifen e mostra o 6o digito', () => {
    expect(formatarCEPDigitando('013101')).toBe('01310-1');
  });

  it('8 digitos (CEP completo) formata corretamente', () => {
    expect(formatarCEPDigitando('01310100')).toBe('01310-100');
  });

  it('mais de 8 digitos trunca em 8', () => {
    expect(formatarCEPDigitando('013101009999')).toBe('01310-100');
  });

  it('CEP com zeros a esquerda preservado', () => {
    expect(formatarCEPDigitando('01001001')).toBe('01001-001');
  });
});

import { describe, it, expect } from 'vitest';
import { gerarVariacoesBrasileiras } from '@/lib/whatsapp/auth';

describe('gerarVariacoesBrasileiras', () => {
  it('número de 12 dígitos (sem 9) gera variação com 9', () => {
    expect(gerarVariacoesBrasileiras('553189791317')).toEqual([
      '553189791317',
      '5531989791317',
    ]);
  });

  it('número de 13 dígitos com 9 gera variação sem 9', () => {
    expect(gerarVariacoesBrasileiras('5531989791317')).toEqual([
      '5531989791317',
      '553189791317',
    ]);
  });

  it('número internacional sem prefixo 55 fica como está', () => {
    expect(gerarVariacoesBrasileiras('14155552671')).toEqual(['14155552671']);
  });

  it('número sem ddd 55 não recebe variação', () => {
    expect(gerarVariacoesBrasileiras('31989791317')).toEqual(['31989791317']);
  });

  it('12 dígitos sem 9 — DDD começando com 9 também recebe o 9', () => {
    expect(gerarVariacoesBrasileiras('559912345678')).toEqual([
      '559912345678',
      '5599912345678',
    ]);
  });

  it('outra cidade — DDD 11 sem o 9', () => {
    expect(gerarVariacoesBrasileiras('551133334444')).toEqual([
      '551133334444',
      '5511933334444',
    ]);
  });

  it('outra cidade — DDD 11 com o 9', () => {
    expect(gerarVariacoesBrasileiras('5511933334444')).toEqual([
      '5511933334444',
      '551133334444',
    ]);
  });
});

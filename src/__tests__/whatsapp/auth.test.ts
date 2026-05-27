import { describe, it, expect } from 'vitest';
import { gerarVariacoesBrasileiras } from '@/lib/whatsapp/auth';

describe('gerarVariacoesBrasileiras', () => {
  // Helper: garante que TODAS as variações esperadas estejam presentes sem
  // amarrar a ordem em que o algoritmo as adiciona ao Set.
  function esperarVariacoes(entrada: string, esperadas: string[]) {
    const out = gerarVariacoesBrasileiras(entrada);
    expect(new Set(out)).toEqual(new Set(esperadas));
  }

  it('entrada 12d com 55 sem 9 → gera 4 variações (com/sem 55, com/sem 9)', () => {
    esperarVariacoes('553189791317', [
      '553189791317',   // com 55, sem 9
      '5531989791317',  // com 55, com 9
      '3189791317',     // sem 55, sem 9
      '31989791317',    // sem 55, com 9
    ]);
  });

  it('entrada 13d com 55 com 9 → gera as mesmas 4 variações', () => {
    esperarVariacoes('5531989791317', [
      '5531989791317',
      '553189791317',
      '31989791317',
      '3189791317',
    ]);
  });

  it('entrada 11d sem 55 com 9 (cadastro tipico do banco) → gera 4 variações', () => {
    esperarVariacoes('31989791317', [
      '31989791317',
      '5531989791317',
      '3189791317',
      '553189791317',
    ]);
  });

  it('entrada 10d sem 55 sem 9 → gera 4 variações', () => {
    esperarVariacoes('3189791317', [
      '3189791317',
      '31989791317',
      '553189791317',
      '5531989791317',
    ]);
  });

  it('número internacional (resto não começa com 9 e não tem 8d) fica como está', () => {
    expect(gerarVariacoesBrasileiras('14155552671')).toEqual(['14155552671']);
  });

  it('12d com 55 sem 9 — DDD começando com 9 também ganha o 9', () => {
    esperarVariacoes('559912345678', [
      '559912345678',
      '5599912345678',
      '9912345678',
      '99912345678',
    ]);
  });

  it('outra cidade — DDD 11 sem o 9', () => {
    esperarVariacoes('551133334444', [
      '551133334444',
      '5511933334444',
      '1133334444',
      '11933334444',
    ]);
  });

  it('outra cidade — DDD 11 com o 9', () => {
    esperarVariacoes('5511933334444', [
      '5511933334444',
      '551133334444',
      '11933334444',
      '1133334444',
    ]);
  });
});

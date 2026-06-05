import { describe, it, expect } from 'vitest';
import { extrairLembrete } from '@/lib/whatsapp/lembreteParser';

describe('extrairLembrete — formas com "lembrete"', () => {
  it('"lembrete: comprar pneu" → "comprar pneu"', () => {
    expect(extrairLembrete('lembrete: comprar pneu')).toBe('comprar pneu');
  });
  it('"lembrete comprar pneu" (sem dois-pontos) → "comprar pneu"', () => {
    expect(extrairLembrete('lembrete comprar pneu')).toBe('comprar pneu');
  });
  it('"cria um lembrete: comprar pneu" → "comprar pneu"', () => {
    expect(extrairLembrete('cria um lembrete: comprar pneu')).toBe('comprar pneu');
  });
  it('"cria um lembrete pra comprar pneu" → "comprar pneu"', () => {
    expect(extrairLembrete('cria um lembrete pra comprar pneu')).toBe('comprar pneu');
  });
  it('"crie um lembrete de pagar o fornecedor" → "pagar o fornecedor"', () => {
    expect(extrairLembrete('crie um lembrete de pagar o fornecedor')).toBe('pagar o fornecedor');
  });
  it('"lembrete dentista amanhã" não come o "de" de dentista', () => {
    expect(extrairLembrete('lembrete dentista amanhã')).toBe('dentista amanhã');
  });
  it('case-insensitive "LEMBRETE: X"', () => {
    expect(extrairLembrete('LEMBRETE: ligar pro cliente')).toBe('ligar pro cliente');
  });
  it('"lembrete" sozinho → "" (intenção sem conteúdo)', () => {
    expect(extrairLembrete('lembrete')).toBe('');
  });
  it('"cria um lembrete" sem conteúdo → ""', () => {
    expect(extrairLembrete('cria um lembrete')).toBe('');
  });
});

describe('extrairLembrete — "me lembra"', () => {
  it('"me lembra de pagar o fornecedor" → "pagar o fornecedor"', () => {
    expect(extrairLembrete('me lembra de pagar o fornecedor')).toBe('pagar o fornecedor');
  });
  it('"me lembre que a carreta voltou" → "a carreta voltou"', () => {
    expect(extrairLembrete('me lembre que a carreta voltou')).toBe('a carreta voltou');
  });
});

describe('extrairLembrete — "anota/anote"', () => {
  it('"anota que comprei pneu" → "comprei pneu"', () => {
    expect(extrairLembrete('anota que comprei pneu')).toBe('comprei pneu');
  });
  it('"anote: cliente novo fechado" → "cliente novo fechado"', () => {
    expect(extrairLembrete('anote: cliente novo fechado')).toBe('cliente novo fechado');
  });
  it('"anota aí que recebi 5 mil" → "recebi 5 mil"', () => {
    expect(extrairLembrete('anota aí que recebi 5 mil')).toBe('recebi 5 mil');
  });
});

describe('extrairLembrete — NÃO dispara (null)', () => {
  it('"nota fiscal 1234" → null (não é lembrete)', () => {
    expect(extrairLembrete('nota fiscal 1234')).toBeNull();
  });
  it('"qual o lucro do mês?" → null', () => {
    expect(extrairLembrete('qual o lucro do mês?')).toBeNull();
  });
  it('"quantos motoristas tenho?" → null', () => {
    expect(extrairLembrete('quantos motoristas tenho?')).toBeNull();
  });
  it('"quero registrar uma despesa" → null (registrar é ambíguo, vai pro Gemini)', () => {
    expect(extrairLembrete('quero registrar uma despesa')).toBeNull();
  });
  it('"guarda esse dado" → null (guarda é ambíguo, vai pro Gemini)', () => {
    expect(extrairLembrete('guarda esse dado')).toBeNull();
  });
  it('"ele lembra do cliente" → null (não é "me lembra" nem "lembrete")', () => {
    expect(extrairLembrete('ele lembra do cliente')).toBeNull();
  });
  it('string vazia → null', () => {
    expect(extrairLembrete('   ')).toBeNull();
  });
});

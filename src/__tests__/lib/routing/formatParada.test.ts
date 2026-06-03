/**
 * Testes dos formatadores de parada (rua, bairro/cidade, janelas).
 */

import { describe, it, expect } from 'vitest';
import { formatarRua, formatarBairroCidade, formatarJanelas } from '@/lib/routing/formatParada';
import type { EnderecoParada } from '@/lib/routing/types';

function end(over: Partial<EnderecoParada> = {}): EnderecoParada {
  return { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', ...over };
}

describe('formatarRua', () => {
  it('logradouro + numero', () => {
    expect(formatarRua(end({ numero: '104' }))).toBe('Av Paulista, 104');
  });
  it('sem numero', () => {
    expect(formatarRua(end({ numero: undefined }))).toBe('Av Paulista');
  });
  it('sem logradouro vira "(sem rua)"', () => {
    expect(formatarRua(end({ logradouro: '', numero: '5' }))).toBe('(sem rua), 5');
  });
  it('inclui CEP só quando opts.cep e cep presente', () => {
    expect(formatarRua(end({ numero: '104', cep: '01310100' }), { cep: true })).toBe('Av Paulista, 104 - CEP 01310100');
    expect(formatarRua(end({ numero: '104', cep: '01310100' }))).toBe('Av Paulista, 104'); // sem opts
    expect(formatarRua(end({ numero: '104' }), { cep: true })).toBe('Av Paulista, 104'); // sem cep
  });
});

describe('formatarBairroCidade', () => {
  it('com bairro', () => {
    expect(formatarBairroCidade(end())).toBe('Bela Vista, São Paulo/SP');
  });
  it('sem bairro', () => {
    expect(formatarBairroCidade(end({ bairro: '' }))).toBe('São Paulo/SP');
  });
});

describe('formatarJanelas', () => {
  it('uma janela', () => {
    expect(formatarJanelas([['09:00', '12:00']])).toBe('09:00–12:00');
  });
  it('múltiplas janelas', () => {
    expect(formatarJanelas([['09:00', '12:00'], ['14:00', '18:00']])).toBe('09:00–12:00 / 14:00–18:00');
  });
  it('vazio/null → string vazia', () => {
    expect(formatarJanelas(null)).toBe('');
    expect(formatarJanelas([])).toBe('');
    expect(formatarJanelas(undefined)).toBe('');
  });
});

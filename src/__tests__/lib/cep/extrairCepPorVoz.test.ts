import { describe, it, expect } from 'vitest';
import { extrairCepDeTranscricao } from '@/lib/cep/extrairCepPorVoz';

describe('extrairCepDeTranscricao', () => {
  it('retorna CEP quando falado por extenso', () => {
    expect(extrairCepDeTranscricao('zero um três um zero um zero zero')).toBe('01310100');
  });

  it('suporta "meia" no lugar de seis', () => {
    expect(extrairCepDeTranscricao('zero um três meia zero um zero zero')).toBe('01360100');
  });

  it('ignora pontuações', () => {
    expect(extrairCepDeTranscricao('zero um três um zero, um zero zero')).toBe('01310100');
  });

  it('suporta dígitos diretos', () => {
    expect(extrairCepDeTranscricao('01310100')).toBe('01310100');
    expect(extrairCepDeTranscricao('01310-100')).toBe('01310100');
  });

  it('suporta mistura de palavras e dígitos', () => {
    expect(extrairCepDeTranscricao('zero 1 três 1 zero 1 zero zero')).toBe('01310100');
  });

  it('retorna null se o texto não formar um CEP de 8 dígitos', () => {
    expect(extrairCepDeTranscricao('Rua Augusta')).toBeNull();
    expect(extrairCepDeTranscricao('zero um três um zero um')).toBeNull(); // incompleto
    expect(extrairCepDeTranscricao('zero um três um zero um zero zero zero')).toBeNull(); // excedente
    expect(extrairCepDeTranscricao('')).toBeNull();
  });
});

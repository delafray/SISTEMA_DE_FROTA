import { describe, it, expect } from 'vitest';
import { extrairNumeroDeTranscricao } from '@/lib/cep/extrairNumeroPorVoz';

describe('extrairNumeroDeTranscricao', () => {
  it('pega o numero numa fala simples "Rua Piata 104"', () => {
    expect(extrairNumeroDeTranscricao('Rua Piatã 104')).toBe('104');
  });

  it('pega o numero no meio da fala "Rua Piata 104 Sao Mateus Contagem"', () => {
    expect(extrairNumeroDeTranscricao('Rua Piatã 104 São Mateus Contagem')).toBe('104');
  });

  it('rua com numero no nome → pega o ULTIMO ("Rua 7 de Setembro 104")', () => {
    expect(extrairNumeroDeTranscricao('Rua 7 de Setembro 104')).toBe('104');
    expect(extrairNumeroDeTranscricao('Avenida 23 de Maio 1500')).toBe('1500');
  });

  it('ignora complemento apos apartamento/bloco ("Rua X 104 apartamento 2")', () => {
    expect(extrairNumeroDeTranscricao('Rua X 104 apartamento 2')).toBe('104');
    expect(extrairNumeroDeTranscricao('Rua X 250 apto 12')).toBe('250');
    expect(extrairNumeroDeTranscricao('Rua X 88 bloco 3')).toBe('88');
  });

  it('lida com numero + letra ("104A" → "104")', () => {
    expect(extrairNumeroDeTranscricao('Rua Piatã 104A')).toBe('104');
  });

  it('retorna null quando nao ha numero', () => {
    expect(extrairNumeroDeTranscricao('Rua Augusta São Paulo')).toBeNull();
    expect(extrairNumeroDeTranscricao('')).toBeNull();
  });

  it('ignora numero longo espurio (>6 digitos, ex: CEP colado)', () => {
    expect(extrairNumeroDeTranscricao('Rua X 32180300')).toBeNull();
  });
});

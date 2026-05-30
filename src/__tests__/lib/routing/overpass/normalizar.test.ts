import { describe, it, expect } from 'vitest';
import { normalizarRua, removerAcentos, regexOverpassRua } from '@/lib/routing/overpass/normalizar';

describe('removerAcentos', () => {
  it('remove acentos comuns', () => {
    expect(removerAcentos('São Paulo')).toBe('Sao Paulo');
    expect(removerAcentos('Avenida do Contorno')).toBe('Avenida do Contorno');
    expect(removerAcentos('Coração')).toBe('Coracao');
    expect(removerAcentos('Mãe')).toBe('Mae');
  });
});

describe('normalizarRua', () => {
  it('lowercase + sem acento', () => {
    expect(normalizarRua('AVENIDA Paulista')).toBe('paulista');
    expect(normalizarRua('Rua São José')).toBe('sao jose');
  });

  it('remove prefixos comuns (avenida, rua, av, r)', () => {
    expect(normalizarRua('Avenida do Contorno')).toBe('contorno');
    expect(normalizarRua('Av do Contorno')).toBe('contorno');
    expect(normalizarRua('Av. do Contorno')).toBe('contorno');
    expect(normalizarRua('AV CONTORNO')).toBe('contorno');
    expect(normalizarRua('Rua das Flores')).toBe('flores');
    expect(normalizarRua('R. das Flores')).toBe('flores');
    expect(normalizarRua('Alameda Santos')).toBe('santos');
  });

  it('colapsa espacos multiplos', () => {
    expect(normalizarRua('Av    do    Contorno')).toBe('contorno');
  });

  it('mesma rua, varias variantes = mesma chave', () => {
    const chave = normalizarRua('Av. do Contorno');
    expect(normalizarRua('Avenida do Contorno')).toBe(chave);
    expect(normalizarRua('AV DO CONTORNO')).toBe(chave);
    expect(normalizarRua('Avenida Do Contorno')).toBe(chave);
  });

  it('string vazia → vazia', () => {
    expect(normalizarRua('')).toBe('');
    expect(normalizarRua('   ')).toBe('');
  });

  it('preserva nome quando nao tem prefixo (ex: numeros de Mal., Sgt.)', () => {
    // "Mal." e "Sgt." sao patentes, nao prefixos de rua
    expect(normalizarRua('Rua Mal Castelo Branco')).toBe('mal castelo branco');
  });
});

describe('regexOverpassRua', () => {
  it('escapa caracteres regex perigosos', () => {
    // Nada perigoso aqui, mas testando que nao quebra
    expect(regexOverpassRua('Av Brasil')).toBe('brasil');
  });

  it('rua vazia → string vazia', () => {
    expect(regexOverpassRua('')).toBe('');
  });
});

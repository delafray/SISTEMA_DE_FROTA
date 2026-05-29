/**
 * Testes dos utilitarios geometricos de rota.
 */

import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  statusDaParada,
  corDoStatus,
  distanciasEntreParadas,
  estimarKmTotal,
  cheapestInsertion,
} from '@/lib/routing/utils';

describe('haversineKm', () => {
  it('zero entre o mesmo ponto', () => {
    expect(haversineKm({ lat: -23.5, lng: -46.6 }, { lat: -23.5, lng: -46.6 })).toBe(0);
  });

  it('aproxima ~95km entre SP e Campinas', () => {
    const d = haversineKm({ lat: -23.5505, lng: -46.6333 }, { lat: -22.9056, lng: -47.0608 });
    // Linha reta (Haversine) entre SP e Campinas é ~84km. Rota rodoviária é ~95km.
    expect(d).toBeGreaterThan(75);
    expect(d).toBeLessThan(95);
  });
});

describe('statusDaParada', () => {
  const paradas = [
    { concluida_em: '2026-05-29T10:00:00Z' },
    { concluida_em: null },
    { concluida_em: null },
  ];

  it('concluida_em preenchido → concluida', () => {
    expect(statusDaParada({ concluida_em: 'x', fixada: false }, 0, paradas)).toBe('concluida');
  });

  it('primeira nao concluida e nao fixada → proxima', () => {
    expect(statusDaParada({ concluida_em: null, fixada: false }, 1, paradas)).toBe('proxima');
  });

  it('fixada → fixada (mesmo se for a proxima)', () => {
    const ps = [{ concluida_em: null }, { concluida_em: null }];
    expect(statusDaParada({ concluida_em: null, fixada: true }, 0, ps)).toBe('fixada');
  });

  it('nao primeira pendente → pendente', () => {
    expect(statusDaParada({ concluida_em: null, fixada: false }, 2, paradas)).toBe('pendente');
  });
});

describe('corDoStatus', () => {
  it('mapeia 4 status pra cores diferentes', () => {
    const cores = new Set([
      corDoStatus('concluida'),
      corDoStatus('proxima'),
      corDoStatus('fixada'),
      corDoStatus('pendente'),
    ]);
    expect(cores.size).toBe(4);
  });

  it('proxima e laranja (#f97316)', () => {
    expect(corDoStatus('proxima')).toBe('#f97316');
  });

  it('concluida e verde (#16a34a)', () => {
    expect(corDoStatus('concluida')).toBe('#16a34a');
  });
});

describe('distanciasEntreParadas', () => {
  it('primeira parada tem distancia 0', () => {
    const d = distanciasEntreParadas([
      { latitude: -23.5, longitude: -46.6 },
      { latitude: -22.9, longitude: -47.0 },
    ]);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThan(0);
  });

  it('array vazio → array vazio', () => {
    expect(distanciasEntreParadas([])).toEqual([]);
  });

  it('uma parada → [0]', () => {
    expect(distanciasEntreParadas([{ latitude: 0, longitude: 0 }])).toEqual([0]);
  });
});

describe('estimarKmTotal', () => {
  it('soma das distancias entre paradas consecutivas', () => {
    const total = estimarKmTotal([
      { latitude: -23.5505, longitude: -46.6333 },  // SP
      { latitude: -22.9056, longitude: -47.0608 },  // Campinas (~95km)
      { latitude: -22.9056, longitude: -47.0608 },  // mesma (+0)
    ]);
    expect(total).toBeGreaterThan(75);
    expect(total).toBeLessThan(95);
  });

  it('zero pra array vazio ou unico', () => {
    expect(estimarKmTotal([])).toBe(0);
    expect(estimarKmTotal([{ latitude: 0, longitude: 0 }])).toBe(0);
  });
});

describe('cheapestInsertion', () => {
  it('lista vazia → posicao 1', () => {
    expect(cheapestInsertion([], { lat: -23.5, lng: -46.6 })).toBe(1);
  });

  it('lista com 1 parada e novo proximo → posicao 1 ou 2 (vai pro extremo mais perto)', () => {
    // Parada em SP, novo em SP mesmo → custo igual em qualquer posicao
    const r = cheapestInsertion(
      [{ latitude: -23.5505, longitude: -46.6333 }],
      { lat: -23.5505, lng: -46.6333 }
    );
    expect([1, 2]).toContain(r);
  });

  it('escolhe meio quando ponto e mais perto entre 2 paradas', () => {
    // Tres pontos quase colineares: SP — meio_paulista — Campinas
    // Novo ponto perto do meio → cheapest insertion deve por entre eles
    const paradas = [
      { latitude: -23.5505, longitude: -46.6333 }, // SP
      { latitude: -22.9056, longitude: -47.0608 }, // Campinas
    ];
    const novo = { lat: -23.2, lng: -46.85 }; // entre SP e Campinas
    // 2 paradas → posicoes possiveis: 1 (antes), 2 (entre), 3 (depois)
    // O custo entre SP-novo-Campinas deve ser menor que adicionar nas pontas
    expect(cheapestInsertion(paradas, novo)).toBe(2);
  });

  it('escolhe extremo quando ponto e mais perto de uma das pontas', () => {
    const paradas = [
      { latitude: -23.5505, longitude: -46.6333 }, // SP
      { latitude: -22.9056, longitude: -47.0608 }, // Campinas
    ];
    // Ponto muito ao sul (mais perto de SP que de Campinas)
    const novoSul = { lat: -24.5, lng: -46.6 };
    // Deve por antes (posicao 1) ou depois — vai pro mais barato
    const ordemSul = cheapestInsertion(paradas, novoSul);
    expect([1, 3]).toContain(ordemSul); // 1=antes de SP, 3=depois de Campinas
  });
});

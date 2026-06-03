/**
 * Sanidade dos tokens de UI mobile: paleta com hex válidos e escalas numéricas.
 */

import { describe, it, expect } from 'vitest';
import { cores, espaco, raio, statusRota } from '@/lib/mobile/ui';

describe('cores', () => {
  it('todos os valores são hex válidos', () => {
    for (const [nome, valor] of Object.entries(cores)) {
      expect(valor, nome).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('mantém as âncoras da marca (não mudar sem querer)', () => {
    expect(cores.azul).toBe('#2563eb');
    expect(cores.verde).toBe('#16a34a');
    expect(cores.laranja).toBe('#f97316');
    expect(cores.branco).toBe('#ffffff');
  });
});

describe('statusRota', () => {
  it('tem os 5 status com bg/texto/borda hex válidos', () => {
    for (const chave of ['concluida', 'em_andamento', 'otimizada', 'rascunho', 'cancelada']) {
      const s = statusRota[chave];
      expect(s, chave).toBeDefined();
      expect(s.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(s.texto).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(s.borda).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('reaproveita os tokens de cor (não hardcoda)', () => {
    expect(statusRota.concluida.bg).toBe(cores.fundoVerde);
    expect(statusRota.cancelada.texto).toBe(cores.vermelhoTexto);
  });
});

describe('escalas', () => {
  it('espaco e raio são números positivos crescentes', () => {
    expect(espaco.xs).toBeLessThan(espaco.sm);
    expect(espaco.sm).toBeLessThan(espaco.md);
    expect(espaco.md).toBeLessThan(espaco.lg);
    expect(raio.sm).toBeLessThan(raio.md);
    expect(raio.md).toBeLessThan(raio.lg);
  });
});

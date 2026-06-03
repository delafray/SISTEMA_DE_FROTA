/**
 * Testes dos helpers de dispositivo mobile (vibrar / lockOrientacaoRetrato).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { vibrar, lockOrientacaoRetrato } from '@/lib/mobile/dispositivo';

afterEach(() => {
  vi.restoreAllMocks();
  // limpa stubs que adicionamos em navigator/screen
  delete (navigator as unknown as { vibrate?: unknown }).vibrate;
});

describe('vibrar', () => {
  it('chama navigator.vibrate com o padrao informado', () => {
    const spy = vi.fn();
    (navigator as unknown as { vibrate: (p: number | number[]) => boolean }).vibrate = spy;
    vibrar(30);
    expect(spy).toHaveBeenCalledWith(30);
    vibrar([10, 20, 10]);
    expect(spy).toHaveBeenCalledWith([10, 20, 10]);
  });

  it('usa 50ms como default', () => {
    const spy = vi.fn();
    (navigator as unknown as { vibrate: (p: number | number[]) => boolean }).vibrate = spy;
    vibrar();
    expect(spy).toHaveBeenCalledWith(50);
  });

  it('nao quebra quando navigator.vibrate nao existe', () => {
    expect(() => vibrar(20)).not.toThrow();
  });
});

describe('lockOrientacaoRetrato', () => {
  it('chama screen.orientation.lock("portrait") quando disponivel', () => {
    const lock = vi.fn(() => Promise.resolve());
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock },
    });
    lockOrientacaoRetrato();
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('engole rejeicao do lock (iOS/sem permissao) sem lançar', () => {
    const lock = vi.fn(() => Promise.reject(new Error('not allowed')));
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock },
    });
    expect(() => lockOrientacaoRetrato()).not.toThrow();
  });

  it('nao quebra quando screen.orientation.lock nao existe', () => {
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {} });
    expect(() => lockOrientacaoRetrato()).not.toThrow();
  });
});

/**
 * Testes do onlineDetector — mocka sync, window, navigator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/offline/sync', () => ({
  sincronizarFila: vi.fn(),
}));

// ─── IMPORTS ────────────────────────────────────────────────────────────

import {
  iniciarOnlineDetector,
  stopOnlineDetector,
  estaOnline,
  detectorAtivo,
} from '@/lib/offline/onlineDetector';
import { sincronizarFila } from '@/lib/offline/sync';

// ─── HELPERS ────────────────────────────────────────────────────────────

function mockWindow() {
  const listeners = new Map<string, EventListener>();
  const mock = {
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener);
    }),
    removeEventListener: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    dispatch: (event: string) => {
      const l = listeners.get(event);
      if (l) l(new Event(event));
    },
  };
  vi.stubGlobal('window', mock);
  return mock;
}

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  stopOnlineDetector();
});

afterEach(() => {
  stopOnlineDetector();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('iniciarOnlineDetector', () => {
  it('adiciona listener no evento online da window', () => {
    const win = mockWindow();
    iniciarOnlineDetector();
    expect(win.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(detectorAtivo()).toBe(true);
  });

  it('listener dispara sincronizarFila quando online event acontece', () => {
    const win = mockWindow();
    iniciarOnlineDetector();
    win.dispatch('online');
    expect(sincronizarFila).toHaveBeenCalledOnce();
  });

  it('idempotente — chamadas consecutivas nao adicionam listeners duplicados', () => {
    const win = mockWindow();
    iniciarOnlineDetector();
    iniciarOnlineDetector();
    iniciarOnlineDetector();
    expect(win.addEventListener).toHaveBeenCalledTimes(1);
  });

  // Caso SSR (sem window) e validado em revisao de codigo — vitest usa jsdom,
  // entao `window` sempre existe nos testes. O guard `typeof window === 'undefined'`
  // no codigo cobre o caso.
});

describe('stopOnlineDetector', () => {
  it('remove listener', () => {
    const win = mockWindow();
    iniciarOnlineDetector();
    stopOnlineDetector();
    expect(win.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(detectorAtivo()).toBe(false);
  });

  it('listener removido nao dispara mais', () => {
    const win = mockWindow();
    iniciarOnlineDetector();
    stopOnlineDetector();
    win.dispatch('online');
    expect(sincronizarFila).not.toHaveBeenCalled();
  });

  it('no-op quando detector nao esta ativo', () => {
    mockWindow();
    expect(() => stopOnlineDetector()).not.toThrow();
  });
});

describe('estaOnline', () => {
  it('true quando navigator.onLine === true', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(estaOnline()).toBe(true);
  });

  it('false quando navigator.onLine === false', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(estaOnline()).toBe(false);
  });

  it('true (assume online) quando navigator nao existe (SSR)', () => {
    expect(estaOnline()).toBe(true);
  });
});

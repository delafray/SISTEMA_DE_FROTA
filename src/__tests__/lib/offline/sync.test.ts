/**
 * Testes do sync worker — mocka fila e fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/offline/fila', () => ({
  listarPendentes: vi.fn(),
  listarComErro: vi.fn(),
  marcarSincronizada: vi.fn(),
  registrarFalha: vi.fn(),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import {
  sincronizarFila,
  iniciarSyncWorker,
  stopSyncWorker,
  workerAtivo,
} from '@/lib/offline/sync';
import {
  listarPendentes,
  listarComErro,
  marcarSincronizada,
  registrarFalha,
} from '@/lib/offline/fila';
import type { NotaNaFila } from '@/lib/offline/types';

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeNota(over: Partial<NotaNaFila> = {}): NotaNaFila {
  return {
    id_local: over.id_local ?? `local-${Math.random().toString(36).slice(2, 10)}`,
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '123',
    endereco: { logradouro: 'Av', bairro: 'B', cidade: 'Sao Paulo', uf: 'SP' },
    latitude: null,
    longitude: null,
    observacao: null,
    status: 'capturada',
    capturado_em: new Date().toISOString(),
    status_sync: over.status_sync ?? 'pendente',
    tentativas: over.tentativas ?? 0,
    ultimo_erro: over.ultimo_erro,
    proxima_tentativa: over.proxima_tentativa,
    ...over,
  };
}

function mockFetchOk(idServidor: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    text: async () => '',
    json: async () => ({ id_servidor: idServidor }),
  });
}

function mockFetchHttpError(status = 500, msg = 'Server Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => msg,
    json: async () => ({ error: msg }),
  });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('econnreset'));
}

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stopSyncWorker(); // limpa interval residual
  vi.unstubAllGlobals();
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  stopSyncWorker();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sincronizarFila — fila vazia', () => {
  it('retorna zeros quando nao ha pendentes nem com erro', async () => {
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    const result = await sincronizarFila();

    expect(result).toEqual({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 });
  });
});

describe('sincronizarFila — sucesso', () => {
  it('envia POST e marca como sincronizada', async () => {
    const nota = makeNota({ id_local: 'a' });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const fetchMock = mockFetchOk('srv-1');
    vi.stubGlobal('fetch', fetchMock);

    const result = await sincronizarFila();

    expect(result).toEqual({ tentadas: 1, sucesso: 1, erro: 0, pulados: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/notas/sync');
    expect(marcarSincronizada).toHaveBeenCalledWith('a', 'srv-1');
  });

  it('envia varias notas em sequencia', async () => {
    const notas = [makeNota({ id_local: 'a' }), makeNota({ id_local: 'b' }), makeNota({ id_local: 'c' })];
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue(notas);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    let counter = 0;
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 201,
      text: async () => '',
      json: async () => ({ id_servidor: `srv-${++counter}` }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sincronizarFila();

    expect(result.sucesso).toBe(3);
    expect(marcarSincronizada).toHaveBeenCalledTimes(3);
  });
});

describe('sincronizarFila — erros', () => {
  it('HTTP 500 chama registrarFalha com backoff exponencial', async () => {
    const nota = makeNota({ id_local: 'a', tentativas: 0 });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchHttpError(500, 'Internal Error'));

    const result = await sincronizarFila();

    expect(result).toEqual({ tentadas: 1, sucesso: 0, erro: 1, pulados: 0 });
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    const args = (registrarFalha as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe('a');
    expect(args[1]).toContain('HTTP 500');
    // backoff = 5000 * 2^0 = 5000
    expect(args[2]).toBe(5000);
  });

  it('backoff dobra a cada tentativa (5s, 10s, 20s, 40s, 80s)', async () => {
    const cenarios = [
      { tentativas: 0, esperado: 5000 },
      { tentativas: 1, esperado: 10000 },
      { tentativas: 2, esperado: 20000 },
      { tentativas: 3, esperado: 40000 },
      { tentativas: 4, esperado: 80000 },
    ];
    for (const { tentativas, esperado } of cenarios) {
      vi.clearAllMocks();
      const nota = makeNota({ id_local: 'x', tentativas });
      (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
      (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      vi.stubGlobal('fetch', mockFetchHttpError(500));

      await sincronizarFila();

      const args = (registrarFalha as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[2]).toBe(esperado);
    }
  });

  it('erro de rede (fetch reject) chama registrarFalha', async () => {
    const nota = makeNota({ id_local: 'a' });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchNetworkError());

    const result = await sincronizarFila();

    expect(result.erro).toBe(1);
    expect(registrarFalha).toHaveBeenCalledOnce();
  });

  it('resposta sem id_servidor cai como erro', async () => {
    const nota = makeNota({ id_local: 'a' });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({}),
    }));

    const result = await sincronizarFila();

    expect(result.erro).toBe(1);
    expect(marcarSincronizada).not.toHaveBeenCalled();
  });
});

describe('sincronizarFila — backoff filter', () => {
  it('nao tenta notas com erro cuja proxima_tentativa esta no futuro', async () => {
    const futuro = new Date(Date.now() + 60000).toISOString();
    const nota = makeNota({
      id_local: 'a',
      status_sync: 'erro',
      tentativas: 2,
      proxima_tentativa: futuro,
    });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    vi.stubGlobal('fetch', vi.fn());

    const result = await sincronizarFila();

    expect(result.tentadas).toBe(0);
  });

  it('tenta nota com erro cuja proxima_tentativa ja passou', async () => {
    const passado = new Date(Date.now() - 1000).toISOString();
    const nota = makeNota({
      id_local: 'a',
      status_sync: 'erro',
      tentativas: 1,
      proxima_tentativa: passado,
    });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    vi.stubGlobal('fetch', mockFetchOk('srv-1'));

    const result = await sincronizarFila();

    expect(result.tentadas).toBe(1);
    expect(result.sucesso).toBe(1);
  });

  it('nao tenta nota apos MAX_TENTATIVAS (5)', async () => {
    const nota = makeNota({ id_local: 'a', tentativas: 5 });
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([nota]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    const result = await sincronizarFila();

    expect(result.tentadas).toBe(0);
  });
});

describe('sincronizarFila — offline / race', () => {
  it('retorna zeros quando navigator.onLine === false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn());

    const result = await sincronizarFila();

    expect(result).toEqual({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 });
    expect(listarPendentes).not.toHaveBeenCalled();
  });
});

describe('iniciarSyncWorker', () => {
  it('chama sincronizarFila imediatamente e instala interval', async () => {
    (listarPendentes as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (listarComErro as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    const stop = iniciarSyncWorker(60000);
    expect(workerAtivo()).toBe(true);

    // libera microtasks pro disparo imediato rodar
    await Promise.resolve();
    await Promise.resolve();

    expect(listarPendentes).toHaveBeenCalled();
    stop();
    expect(workerAtivo()).toBe(false);
  });

  it('idempotente — chamadas consecutivas nao criam workers duplicados', () => {
    const stop1 = iniciarSyncWorker(60000);
    const stop2 = iniciarSyncWorker(60000);
    expect(workerAtivo()).toBe(true);
    stop1();
    expect(workerAtivo()).toBe(false);
    stop2(); // no-op
  });
});

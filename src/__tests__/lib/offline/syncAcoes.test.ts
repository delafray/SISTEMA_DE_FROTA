/**
 * Testes do sync worker das ACOES da rota — mocka a fila (acoesRota) e fetch.
 * Espelha o estilo de sync.test.ts (notas).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/offline/acoesRota', () => ({
  listarAcoesPendentes: vi.fn(),
  listarAcoesComErro: vi.fn(),
  marcarAcaoSincronizada: vi.fn(),
  registrarFalhaAcao: vi.fn(),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import {
  sincronizarAcoes,
  iniciarSyncAcoesWorker,
  stopSyncAcoesWorker,
  workerAcoesAtivo,
} from '@/lib/offline/syncAcoes';
import {
  listarAcoesPendentes,
  listarAcoesComErro,
  marcarAcaoSincronizada,
  registrarFalhaAcao,
} from '@/lib/offline/acoesRota';
import type { AcaoRotaFila } from '@/lib/offline/types';

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeAcao(over: Partial<AcaoRotaFila> = {}): AcaoRotaFila {
  return {
    id_local: over.id_local ?? `acao-${Math.random().toString(36).slice(2, 10)}`,
    tipo: over.tipo ?? 'concluir_parada',
    rota_id: over.rota_id ?? 'rota-1',
    parada_id: over.parada_id ?? 'p1',
    endpoint: over.endpoint ?? '/api/routing/rota/rota-1/paradas',
    metodo: over.metodo ?? 'PATCH',
    corpo: over.corpo ?? { paradas: [{ id: 'p1', concluida_em: '2026-06-03T10:00:00Z' }] },
    status_sync: over.status_sync ?? 'pendente',
    tentativas: over.tentativas ?? 0,
    ultimo_erro: over.ultimo_erro,
    proxima_tentativa: over.proxima_tentativa,
    criado_em: over.criado_em ?? new Date().toISOString(),
  };
}

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ ok: true }),
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
  return vi.fn().mockRejectedValue(new Error('Failed to fetch'));
}

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stopSyncAcoesWorker();
  vi.unstubAllGlobals();
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  stopSyncAcoesWorker();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sincronizarAcoes — fila vazia', () => {
  it('retorna zeros quando nao ha acoes', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    expect(await sincronizarAcoes()).toEqual({ tentadas: 0, sucesso: 0, erro: 0 });
  });
});

describe('sincronizarAcoes — sucesso', () => {
  it('reexecuta o PATCH com endpoint/metodo/corpo da acao e remove da fila', async () => {
    const acao = makeAcao({ id_local: 'a', endpoint: '/api/routing/rota/r9/paradas', corpo: { paradas: [{ id: 'p1', concluida_em: 'x' }] } });
    asMock(listarAcoesPendentes).mockResolvedValue([acao]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const r = await sincronizarAcoes();

    expect(r).toEqual({ tentadas: 1, sucesso: 1, erro: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/routing/rota/r9/paradas');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ paradas: [{ id: 'p1', concluida_em: 'x' }] });
    expect(marcarAcaoSincronizada).toHaveBeenCalledWith('a');
  });

  it('processa em ORDEM cronologica (concluir antes de encerrar)', async () => {
    const concluir = makeAcao({ id_local: 'c', tipo: 'concluir_parada', criado_em: '2026-06-03T10:00:00Z' });
    const encerrar = makeAcao({ id_local: 'e', tipo: 'encerrar_rota', parada_id: null, criado_em: '2026-06-03T10:05:00Z' });
    // Ordem de entrada embaralhada de proposito
    asMock(listarAcoesPendentes).mockResolvedValue([encerrar, concluir]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await sincronizarAcoes();

    expect(asMock(marcarAcaoSincronizada).mock.calls.map((c) => c[0])).toEqual(['c', 'e']);
  });
});

describe('sincronizarAcoes — erros', () => {
  it('HTTP 500 chama registrarFalhaAcao com backoff exponencial (5s base)', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([makeAcao({ id_local: 'a', tentativas: 0 })]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchHttpError(500));

    const r = await sincronizarAcoes();

    expect(r).toEqual({ tentadas: 1, sucesso: 0, erro: 1 });
    const args = asMock(registrarFalhaAcao).mock.calls[0];
    expect(args[0]).toBe('a');
    expect(args[1]).toContain('HTTP 500');
    expect(args[2]).toBe(5000);
  });

  it('backoff dobra a cada tentativa (5s,10s,20s,40s,80s)', async () => {
    for (const { tentativas, esperado } of [
      { tentativas: 0, esperado: 5000 },
      { tentativas: 1, esperado: 10000 },
      { tentativas: 2, esperado: 20000 },
      { tentativas: 3, esperado: 40000 },
      { tentativas: 4, esperado: 80000 },
    ]) {
      vi.clearAllMocks();
      asMock(listarAcoesPendentes).mockResolvedValue([makeAcao({ id_local: 'x', tentativas })]);
      asMock(listarAcoesComErro).mockResolvedValue([]);
      vi.stubGlobal('fetch', mockFetchHttpError(500));
      await sincronizarAcoes();
      expect(asMock(registrarFalhaAcao).mock.calls[0][2]).toBe(esperado);
    }
  });

  it('erro de rede (fetch reject) cai como erro e nao remove da fila', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([makeAcao({ id_local: 'a' })]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchNetworkError());

    const r = await sincronizarAcoes();

    expect(r.erro).toBe(1);
    expect(registrarFalhaAcao).toHaveBeenCalledOnce();
    expect(marcarAcaoSincronizada).not.toHaveBeenCalled();
  });

  it('resposta HTTP 200 com { ok:false } conta como erro (rejeicao logica do servidor)', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([makeAcao({ id_local: 'a' })]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ ok: false, erros: [{ message: 'parada invalida' }] }),
    }));

    const r = await sincronizarAcoes();

    expect(r.erro).toBe(1);
    expect(marcarAcaoSincronizada).not.toHaveBeenCalled();
    expect(registrarFalhaAcao).toHaveBeenCalledOnce();
  });
});

describe('sincronizarAcoes — backoff filter / limites', () => {
  it('nao tenta acao com erro cuja proxima_tentativa esta no futuro', async () => {
    const futuro = new Date(Date.now() + 60000).toISOString();
    asMock(listarAcoesPendentes).mockResolvedValue([]);
    asMock(listarAcoesComErro).mockResolvedValue([makeAcao({ id_local: 'a', status_sync: 'erro', tentativas: 2, proxima_tentativa: futuro })]);
    vi.stubGlobal('fetch', vi.fn());

    expect((await sincronizarAcoes()).tentadas).toBe(0);
  });

  it('tenta acao com erro cujo backoff ja passou', async () => {
    const passado = new Date(Date.now() - 1000).toISOString();
    asMock(listarAcoesPendentes).mockResolvedValue([]);
    asMock(listarAcoesComErro).mockResolvedValue([makeAcao({ id_local: 'a', status_sync: 'erro', tentativas: 1, proxima_tentativa: passado })]);
    vi.stubGlobal('fetch', mockFetchOk());

    const r = await sincronizarAcoes();
    expect(r.tentadas).toBe(1);
    expect(r.sucesso).toBe(1);
  });

  it('nao tenta acao apos MAX_TENTATIVAS (5)', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([makeAcao({ id_local: 'a', tentativas: 5 })]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    expect((await sincronizarAcoes()).tentadas).toBe(0);
  });
});

describe('sincronizarAcoes — offline guard', () => {
  it('retorna zeros e nem le a fila quando navigator.onLine === false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn());

    const r = await sincronizarAcoes();

    expect(r).toEqual({ tentadas: 0, sucesso: 0, erro: 0 });
    expect(listarAcoesPendentes).not.toHaveBeenCalled();
  });
});

describe('iniciarSyncAcoesWorker', () => {
  it('dispara uma vez imediatamente e instala interval; stop desliga', async () => {
    asMock(listarAcoesPendentes).mockResolvedValue([]);
    asMock(listarAcoesComErro).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());

    const stop = iniciarSyncAcoesWorker(60000);
    expect(workerAcoesAtivo()).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    expect(listarAcoesPendentes).toHaveBeenCalled();

    stop();
    expect(workerAcoesAtivo()).toBe(false);
  });

  it('idempotente — chamadas consecutivas nao criam workers duplicados', () => {
    const stop1 = iniciarSyncAcoesWorker(60000);
    const stop2 = iniciarSyncAcoesWorker(60000);
    expect(workerAcoesAtivo()).toBe(true);
    stop1();
    expect(workerAcoesAtivo()).toBe(false);
    stop2(); // no-op
  });
});

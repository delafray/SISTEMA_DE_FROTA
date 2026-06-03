/**
 * Testes da fila de ACOES da rota feitas offline (Dexie + IndexedDB).
 * Usa `fake-indexeddb/auto` pra polyfill IndexedDB em node.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  enfileirarConcluirParada,
  enfileirarEncerrarRota,
  listarAcoesPendentes,
  listarAcoesComErro,
  contarAcoesNaoSincronizadas,
  marcarAcaoSincronizada,
  registrarFalhaAcao,
  limparAcoes,
} from '@/lib/offline/acoesRota';
import { getDB } from '@/lib/offline/fila';
import type { AcaoRotaFila } from '@/lib/offline/types';

/** Insere uma acao com campos controlados (pra testar ordem/estado direto). */
async function inserir(over: Partial<AcaoRotaFila>): Promise<AcaoRotaFila> {
  const acao: AcaoRotaFila = {
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
  await getDB().acoes_rota.add(acao);
  return acao;
}

beforeEach(async () => {
  await limparAcoes();
});

describe('acoesRota — enfileirarConcluirParada', () => {
  it('persiste a acao com endpoint/corpo prontos pro PATCH', async () => {
    const acao = await enfileirarConcluirParada({
      rota_id: 'rota-9',
      parada_id: 'p7',
      concluida_em: '2026-06-03T12:00:00Z',
    });

    expect(acao).not.toBeNull();
    const todas = await listarAcoesPendentes();
    expect(todas).toHaveLength(1);
    expect(todas[0].tipo).toBe('concluir_parada');
    expect(todas[0].endpoint).toBe('/api/routing/rota/rota-9/paradas');
    expect(todas[0].metodo).toBe('PATCH');
    expect(todas[0].corpo).toEqual({ paradas: [{ id: 'p7', concluida_em: '2026-06-03T12:00:00Z' }] });
    expect(todas[0].parada_id).toBe('p7');
  });

  it('DEDUP: novo clique na MESMA parada substitui o anterior (ultimo vence)', async () => {
    await enfileirarConcluirParada({ rota_id: 'r1', parada_id: 'p1', concluida_em: '2026-06-03T10:00:00Z' });
    await enfileirarConcluirParada({ rota_id: 'r1', parada_id: 'p1', concluida_em: '2026-06-03T10:05:00Z' });

    const todas = await listarAcoesPendentes();
    expect(todas).toHaveLength(1);
    expect(todas[0].corpo).toEqual({ paradas: [{ id: 'p1', concluida_em: '2026-06-03T10:05:00Z' }] });
  });

  it('paradas DIFERENTES coexistem (dedup so por parada)', async () => {
    await enfileirarConcluirParada({ rota_id: 'r1', parada_id: 'p1', concluida_em: '2026-06-03T10:00:00Z' });
    await enfileirarConcluirParada({ rota_id: 'r1', parada_id: 'p2', concluida_em: '2026-06-03T10:01:00Z' });

    const todas = await listarAcoesPendentes();
    expect(todas.map((a) => a.parada_id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('acoesRota — enfileirarEncerrarRota', () => {
  it('persiste a acao de encerrar com status concluida', async () => {
    const acao = await enfileirarEncerrarRota({ rota_id: 'rota-5' });
    expect(acao).not.toBeNull();

    const todas = await listarAcoesPendentes();
    expect(todas).toHaveLength(1);
    expect(todas[0].tipo).toBe('encerrar_rota');
    expect(todas[0].endpoint).toBe('/api/routing/rota/rota-5');
    expect(todas[0].corpo).toEqual({ status: 'concluida' });
    expect(todas[0].parada_id).toBeNull();
  });

  it('DEDUP: encerrar de novo a mesma rota substitui (so encerra uma vez)', async () => {
    await enfileirarEncerrarRota({ rota_id: 'r1' });
    await enfileirarEncerrarRota({ rota_id: 'r1' });
    const todas = await listarAcoesPendentes();
    expect(todas.filter((a) => a.tipo === 'encerrar_rota')).toHaveLength(1);
  });

  it('encerrar NAO remove o concluir da mesma rota (tipos diferentes coexistem)', async () => {
    await enfileirarConcluirParada({ rota_id: 'r1', parada_id: 'p1', concluida_em: '2026-06-03T10:00:00Z' });
    await enfileirarEncerrarRota({ rota_id: 'r1' });
    const todas = await listarAcoesPendentes();
    expect(todas.map((a) => a.tipo).sort()).toEqual(['concluir_parada', 'encerrar_rota']);
  });
});

describe('acoesRota — listagem e contagem', () => {
  it('listarAcoesPendentes traz so pendente, mais ANTIGA primeiro', async () => {
    await inserir({ id_local: 'b', status_sync: 'pendente', criado_em: '2026-06-03T10:02:00Z' });
    await inserir({ id_local: 'a', status_sync: 'pendente', criado_em: '2026-06-03T10:01:00Z' });
    await inserir({ id_local: 's', status_sync: 'sincronizada', criado_em: '2026-06-03T10:00:00Z' });
    await inserir({ id_local: 'e', status_sync: 'erro', criado_em: '2026-06-03T09:00:00Z' });

    const pend = await listarAcoesPendentes();
    expect(pend.map((a) => a.id_local)).toEqual(['a', 'b']);
  });

  it('listarAcoesComErro traz so status erro', async () => {
    await inserir({ id_local: 'p', status_sync: 'pendente' });
    await inserir({ id_local: 'e1', status_sync: 'erro', criado_em: '2026-06-03T09:00:00Z' });
    await inserir({ id_local: 'e2', status_sync: 'erro', criado_em: '2026-06-03T08:00:00Z' });

    const comErro = await listarAcoesComErro();
    expect(comErro.map((a) => a.id_local)).toEqual(['e2', 'e1']);
  });

  it('contarAcoesNaoSincronizadas soma pendente + erro (ignora sincronizada)', async () => {
    await inserir({ id_local: '1', status_sync: 'pendente' });
    await inserir({ id_local: '2', status_sync: 'erro' });
    await inserir({ id_local: '3', status_sync: 'sincronizada' });
    expect(await contarAcoesNaoSincronizadas()).toBe(2);
  });
});

describe('acoesRota — marcarAcaoSincronizada / registrarFalhaAcao', () => {
  it('marcarAcaoSincronizada REMOVE a acao da fila', async () => {
    await inserir({ id_local: 'ok' });
    await marcarAcaoSincronizada('ok');
    const todas = await getDB().acoes_rota.toArray();
    expect(todas).toHaveLength(0);
  });

  it('registrarFalhaAcao incrementa tentativas, agenda backoff e marca erro', async () => {
    await inserir({ id_local: 'x', status_sync: 'pendente', tentativas: 1 });

    const before = Date.now();
    await registrarFalhaAcao('x', 'HTTP 500', 10000);
    const after = Date.now();

    const a = await getDB().acoes_rota.get('x');
    expect(a?.tentativas).toBe(2);
    expect(a?.ultimo_erro).toBe('HTTP 500');
    expect(a?.status_sync).toBe('erro');
    const proxMs = new Date(a!.proxima_tentativa!).getTime();
    expect(proxMs).toBeGreaterThanOrEqual(before + 10000 - 50);
    expect(proxMs).toBeLessThanOrEqual(after + 10000 + 50);
  });

  it('registrarFalhaAcao nao quebra quando a acao ja sumiu (deduplicada)', async () => {
    await expect(registrarFalhaAcao('nao-existe', 'erro', 1000)).resolves.toBeUndefined();
  });
});

/**
 * Testes da fila offline (Dexie + IndexedDB).
 * Usa `fake-indexeddb/auto` pra polyfill IndexedDB em node.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  adicionarNota,
  listarPendentes,
  listarComErro,
  listarTodas,
  contarPorStatus,
  buscarPorIdLocal,
  marcarSincronizada,
  registrarFalha,
  reenfileirar,
  remover,
  limparTudo,
  getDB,
} from '@/lib/offline/fila';
import type { NotaNaFila } from '@/lib/offline/types';

function makeNota(over: Partial<NotaNaFila> = {}): NotaNaFila {
  return {
    id_local: over.id_local ?? `local-${Math.random().toString(36).slice(2, 10)}`,
    motorista_id: over.motorista_id ?? 'mot-1',
    empresa_id: over.empresa_id ?? 'emp-1',
    cep: over.cep ?? '01310100',
    numero: over.numero ?? '123',
    endereco: over.endereco ?? {
      logradouro: 'Av Paulista',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      uf: 'SP',
    },
    latitude: over.latitude ?? null,
    longitude: over.longitude ?? null,
    observacao: over.observacao ?? null,
    status: over.status ?? 'capturada',
    capturado_em: over.capturado_em ?? new Date().toISOString(),
    status_sync: over.status_sync ?? 'pendente',
    tentativas: over.tentativas ?? 0,
    ultimo_erro: over.ultimo_erro,
    proxima_tentativa: over.proxima_tentativa,
    id_servidor: over.id_servidor,
  };
}

beforeEach(async () => {
  await limparTudo();
});

describe('fila — adicionar/buscar/listar', () => {
  it('adicionarNota persiste no IndexedDB e buscarPorIdLocal devolve', async () => {
    const nota = makeNota({ id_local: 'local-abc' });
    await adicionarNota(nota);

    const found = await buscarPorIdLocal('local-abc');
    expect(found).toBeDefined();
    expect(found?.motorista_id).toBe('mot-1');
    expect(found?.cep).toBe('01310100');
  });

  it('buscarPorIdLocal retorna undefined quando nao existe', async () => {
    expect(await buscarPorIdLocal('nope')).toBeUndefined();
  });

  it('listarTodas retorna todas em ordem capturado_em DESC', async () => {
    await adicionarNota(makeNota({ id_local: 'a', capturado_em: '2026-05-27T10:00:00Z' }));
    await adicionarNota(makeNota({ id_local: 'c', capturado_em: '2026-05-27T12:00:00Z' }));
    await adicionarNota(makeNota({ id_local: 'b', capturado_em: '2026-05-27T11:00:00Z' }));

    const todas = await listarTodas();
    expect(todas.map((n) => n.id_local)).toEqual(['c', 'b', 'a']);
  });

  it('listarTodas filtra por motorista_id', async () => {
    await adicionarNota(makeNota({ id_local: 'a', motorista_id: 'mot-1' }));
    await adicionarNota(makeNota({ id_local: 'b', motorista_id: 'mot-2' }));
    await adicionarNota(makeNota({ id_local: 'c', motorista_id: 'mot-1' }));

    const mot1 = await listarTodas('mot-1');
    expect(mot1.map((n) => n.id_local).sort()).toEqual(['a', 'c']);
  });
});

describe('fila — listarPendentes / listarComErro', () => {
  it('listarPendentes traz so status_sync=pendente, ordenado ASC', async () => {
    await adicionarNota(makeNota({ id_local: 'p1', status_sync: 'pendente', capturado_em: '2026-05-27T10:00:00Z' }));
    await adicionarNota(makeNota({ id_local: 's1', status_sync: 'sincronizada' }));
    await adicionarNota(makeNota({ id_local: 'p2', status_sync: 'pendente', capturado_em: '2026-05-27T09:00:00Z' }));
    await adicionarNota(makeNota({ id_local: 'e1', status_sync: 'erro' }));

    const pendentes = await listarPendentes();
    expect(pendentes.map((n) => n.id_local)).toEqual(['p2', 'p1']);
  });

  it('listarComErro traz so status_sync=erro', async () => {
    await adicionarNota(makeNota({ id_local: 'p', status_sync: 'pendente' }));
    await adicionarNota(makeNota({ id_local: 'e', status_sync: 'erro' }));
    await adicionarNota(makeNota({ id_local: 's', status_sync: 'sincronizada' }));

    const comErro = await listarComErro();
    expect(comErro.map((n) => n.id_local)).toEqual(['e']);
  });
});

describe('fila — contarPorStatus', () => {
  it('conta certo por status_sync', async () => {
    await adicionarNota(makeNota({ id_local: '1', status_sync: 'pendente' }));
    await adicionarNota(makeNota({ id_local: '2', status_sync: 'pendente' }));
    await adicionarNota(makeNota({ id_local: '3', status_sync: 'sincronizada' }));
    await adicionarNota(makeNota({ id_local: '4', status_sync: 'erro' }));

    const counts = await contarPorStatus();
    expect(counts).toEqual({ pendente: 2, sincronizada: 1, erro: 1 });
  });

  it('zero pra todos quando fila vazia', async () => {
    expect(await contarPorStatus()).toEqual({ pendente: 0, sincronizada: 0, erro: 0 });
  });
});

describe('fila — marcarSincronizada', () => {
  it('marca status=sincronizada e guarda id_servidor, limpa proxima_tentativa', async () => {
    await adicionarNota(
      makeNota({
        id_local: 'a',
        status_sync: 'erro',
        proxima_tentativa: '2026-05-27T20:00:00Z',
        ultimo_erro: 'fail',
        tentativas: 2,
      })
    );

    await marcarSincronizada('a', 'srv-uuid-1');

    const n = await buscarPorIdLocal('a');
    expect(n?.status_sync).toBe('sincronizada');
    expect(n?.id_servidor).toBe('srv-uuid-1');
    expect(n?.proxima_tentativa).toBeUndefined();
    expect(n?.ultimo_erro).toBeUndefined();
  });
});

describe('fila — registrarFalha', () => {
  it('incrementa tentativas, salva ultimo_erro, agenda proxima_tentativa, muda pra erro', async () => {
    await adicionarNota(makeNota({ id_local: 'x', status_sync: 'pendente', tentativas: 1 }));

    const before = Date.now();
    await registrarFalha('x', 'HTTP 500', 10000);
    const after = Date.now();

    const n = await buscarPorIdLocal('x');
    expect(n?.tentativas).toBe(2);
    expect(n?.ultimo_erro).toBe('HTTP 500');
    expect(n?.status_sync).toBe('erro');
    const proxMs = new Date(n!.proxima_tentativa!).getTime();
    expect(proxMs).toBeGreaterThanOrEqual(before + 10000 - 50);
    expect(proxMs).toBeLessThanOrEqual(after + 10000 + 50);
  });

  it('nao quebra quando id_local nao existe', async () => {
    await expect(registrarFalha('inexistente', 'erro', 1000)).resolves.toBeUndefined();
  });
});

describe('fila — reenfileirar / remover / limparTudo', () => {
  it('reenfileirar volta pra pendente e limpa proxima_tentativa', async () => {
    await adicionarNota(
      makeNota({
        id_local: 'r',
        status_sync: 'erro',
        proxima_tentativa: '2026-05-27T20:00:00Z',
      })
    );

    await reenfileirar('r');

    const n = await buscarPorIdLocal('r');
    expect(n?.status_sync).toBe('pendente');
    expect(n?.proxima_tentativa).toBeUndefined();
  });

  it('remover apaga a nota da fila', async () => {
    await adicionarNota(makeNota({ id_local: 'del' }));
    await remover('del');
    expect(await buscarPorIdLocal('del')).toBeUndefined();
  });

  it('limparTudo apaga todas', async () => {
    await adicionarNota(makeNota({ id_local: '1' }));
    await adicionarNota(makeNota({ id_local: '2' }));

    await limparTudo();

    const todas = await listarTodas();
    expect(todas).toEqual([]);
  });
});

describe('fila — getDB', () => {
  it('retorna mesma instancia em chamadas consecutivas (singleton)', () => {
    const a = getDB();
    const b = getDB();
    expect(a).toBe(b);
  });
});

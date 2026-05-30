/**
 * Testes para editarNota em fila.ts.
 * Usa `fake-indexeddb/auto` pra polyfill IndexedDB em node.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { adicionarNota, editarNota, buscarPorIdLocal, limparTudo, limparFila } from '@/lib/offline/fila';
import type { NotaNaFila } from '@/lib/offline/types';

// ─── helper ─────────────────────────────────────────────────────────

function notaBase(overrides: Partial<NotaNaFila> = {}): NotaNaFila {
  return {
    id_local: 'nota-edit-1',
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '100',
    endereco: { logradouro: 'Av. Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' },
    latitude: null,
    longitude: null,
    observacao: null,
    status: 'capturada',
    capturado_em: '2026-05-29T10:00:00Z',
    status_sync: 'sincronizada',
    tentativas: 3,
    ultimo_erro: 'algum erro anterior',
    ...overrides,
  };
}

beforeEach(async () => {
  await limparTudo();
});

// ─── Testes ─────────────────────────────────────────────────────────

describe('editarNota', () => {
  it('atualiza o endereco da nota', async () => {
    await adicionarNota(notaBase());

    await editarNota('nota-edit-1', {
      endereco: { logradouro: 'Rua Nova', bairro: 'Vila X', cidade: 'SP', uf: 'SP' },
    });

    const atualizada = await buscarPorIdLocal('nota-edit-1');
    expect(atualizada?.endereco.logradouro).toBe('Rua Nova');
  });

  it('atualiza o numero', async () => {
    await adicionarNota(notaBase());
    await editarNota('nota-edit-1', { numero: '999' });
    const atualizada = await buscarPorIdLocal('nota-edit-1');
    expect(atualizada?.numero).toBe('999');
  });

  it('reseta status_sync para pendente mesmo se estava sincronizada', async () => {
    await adicionarNota(notaBase({ status_sync: 'sincronizada' }));
    await editarNota('nota-edit-1', { numero: '200' });
    const atualizada = await buscarPorIdLocal('nota-edit-1');
    expect(atualizada?.status_sync).toBe('pendente');
  });

  it('reseta tentativas para 0', async () => {
    await adicionarNota(notaBase({ tentativas: 5 }));
    await editarNota('nota-edit-1', { numero: '200' });
    const atualizada = await buscarPorIdLocal('nota-edit-1');
    expect(atualizada?.tentativas).toBe(0);
  });

  it('limpa ultimo_erro', async () => {
    await adicionarNota(notaBase({ ultimo_erro: 'HTTP 500' }));
    await editarNota('nota-edit-1', { numero: '200' });
    const atualizada = await buscarPorIdLocal('nota-edit-1');
    expect(atualizada?.ultimo_erro).toBeUndefined();
  });

  it('nao falha se nota nao existe', async () => {
    await expect(editarNota('nota-inexistente', { numero: '1' })).resolves.toBeUndefined();
  });
});

describe('limparFila', () => {
  it('remove apenas as notas do motorista especificado', async () => {
    await adicionarNota(notaBase({ id_local: 'n1', motorista_id: 'mot-1' }));
    await adicionarNota(notaBase({ id_local: 'n2', motorista_id: 'mot-2' }));

    await limparFila('mot-1');

    expect(await buscarPorIdLocal('n1')).toBeUndefined();
    expect(await buscarPorIdLocal('n2')).toBeDefined();
  });
});

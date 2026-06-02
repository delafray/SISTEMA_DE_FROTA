/**
 * Testes do cache local da rota ativa (Dexie + IndexedDB).
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  salvarRotaAtiva,
  lerRotaAtiva,
  lerUltimaRotaAtiva,
  limparRotaAtiva,
  limparRotasAtivas,
} from '@/lib/offline/rotaCache';
import { getDB } from '@/lib/offline/fila';
import type { RotaOtimizada, Parada } from '@/lib/routing/types';

function makeRota(over: Partial<RotaOtimizada> = {}): RotaOtimizada {
  return {
    id: over.id ?? 'rota-1',
    motorista_id: over.motorista_id ?? 'mot-1',
    empresa_id: over.empresa_id ?? 'emp-1',
    data: over.data ?? '2026-06-02',
    distancia_total_km: over.distancia_total_km ?? 42,
    tempo_total_min: over.tempo_total_min ?? 90,
    status: over.status ?? 'otimizada',
    otimizada_em: over.otimizada_em ?? '2026-06-02T10:00:00Z',
    criada_em: over.criada_em ?? '2026-06-02T09:00:00Z',
  };
}

function makeParada(over: Partial<Parada> = {}): Parada {
  return {
    id: over.id ?? 'p1',
    rota_id: over.rota_id ?? 'rota-1',
    nota_id: over.nota_id ?? null,
    ordem: over.ordem ?? 1,
    endereco: over.endereco ?? { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP', numero: '100' },
    latitude: over.latitude ?? -23.56,
    longitude: over.longitude ?? -46.65,
    fixada: over.fixada ?? false,
    janela_horario: over.janela_horario ?? null,
    tempo_descarga_min: over.tempo_descarga_min ?? 5,
    observacao: over.observacao ?? null,
    concluida_em: over.concluida_em ?? null,
  };
}

beforeEach(async () => {
  await getDB().rota_ativa.clear();
});

describe('salvar/ler rota ativa', () => {
  it('salva snapshot e le por id', async () => {
    await salvarRotaAtiva({ rota: makeRota({ id: 'r-abc' }), paradas: [makeParada({ id: 'pa' }), makeParada({ id: 'pb', ordem: 2 })] });
    const c = await lerRotaAtiva('r-abc');
    expect(c?.id).toBe('r-abc');
    expect(c?.motorista_id).toBe('mot-1');
    expect(c?.paradas).toHaveLength(2);
    expect(c?.salvo_em).toBeTruthy();
  });

  it('lerRotaAtiva devolve null quando nao existe', async () => {
    expect(await lerRotaAtiva('nope')).toBeNull();
  });

  it('put sobrescreve a mesma rota (preserva progresso atualizado)', async () => {
    await salvarRotaAtiva({ rota: makeRota({ id: 'r1' }), paradas: [makeParada({ id: 'p1', concluida_em: null })] });
    await salvarRotaAtiva({ rota: makeRota({ id: 'r1' }), paradas: [makeParada({ id: 'p1', concluida_em: '2026-06-02T11:00:00Z' })] });
    const c = await lerRotaAtiva('r1');
    expect(await getDB().rota_ativa.count()).toBe(1);
    expect(c?.paradas[0].concluida_em).toBe('2026-06-02T11:00:00Z');
  });

  it('nao grava rota sem id', async () => {
    await salvarRotaAtiva({ rota: makeRota({ id: '' }), paradas: [] });
    expect(await getDB().rota_ativa.count()).toBe(0);
  });
});

describe('lerUltimaRotaAtiva', () => {
  it('devolve a mais recente por salvo_em', async () => {
    await getDB().rota_ativa.put({ id: 'velha', empresa_id: 'e', motorista_id: 'mot-1', rota: makeRota({ id: 'velha' }), paradas: [], salvo_em: '2026-06-01T08:00:00Z' });
    await getDB().rota_ativa.put({ id: 'nova', empresa_id: 'e', motorista_id: 'mot-1', rota: makeRota({ id: 'nova' }), paradas: [], salvo_em: '2026-06-02T08:00:00Z' });
    const c = await lerUltimaRotaAtiva('mot-1');
    expect(c?.id).toBe('nova');
  });

  it('filtra por motorista', async () => {
    await getDB().rota_ativa.put({ id: 'a', empresa_id: 'e', motorista_id: 'mot-1', rota: makeRota({ id: 'a' }), paradas: [], salvo_em: '2026-06-02T08:00:00Z' });
    await getDB().rota_ativa.put({ id: 'b', empresa_id: 'e', motorista_id: 'mot-2', rota: makeRota({ id: 'b' }), paradas: [], salvo_em: '2026-06-02T09:00:00Z' });
    const c = await lerUltimaRotaAtiva('mot-1');
    expect(c?.id).toBe('a');
  });

  it('devolve null quando nao ha rotas', async () => {
    expect(await lerUltimaRotaAtiva('mot-x')).toBeNull();
  });
});

describe('limpeza', () => {
  it('limparRotaAtiva remove uma', async () => {
    await salvarRotaAtiva({ rota: makeRota({ id: 'r1' }), paradas: [] });
    await limparRotaAtiva('r1');
    expect(await lerRotaAtiva('r1')).toBeNull();
  });

  it('limparRotasAtivas zera tudo', async () => {
    await salvarRotaAtiva({ rota: makeRota({ id: 'r1' }), paradas: [] });
    await salvarRotaAtiva({ rota: makeRota({ id: 'r2' }), paradas: [] });
    await limparRotasAtivas();
    expect(await getDB().rota_ativa.count()).toBe(0);
  });
});

/**
 * Cache local da rota ativa (IndexedDB) — o motorista ve as paradas, o mapa e
 * exporta pro Google Maps mesmo SEM internet.
 *
 * Fluxo:
 * - Na fase em_rota, sempre que a rota carrega/atualiza: `salvarRotaAtiva()`.
 * - Quando o fetch de `/api/routing/rota/:id` falha (offline): `lerRotaAtiva()`.
 * - Ao abrir o app offline: `lerUltimaRotaAtiva()` retoma a rota mais recente.
 *
 * BROWSER-ONLY. Em SSR/jsdom sem polyfill, as funcoes viram no-op.
 */

import { getDB } from './fila';
import type { RotaCacheada } from './types';
import type { RotaOtimizada, Parada } from '@/lib/routing/types';

function disponivel(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Grava (ou atualiza) o snapshot da rota ativa. PK = rota.id. */
export async function salvarRotaAtiva(args: { rota: RotaOtimizada; paradas: Parada[] }): Promise<void> {
  if (!disponivel()) return;
  const { rota, paradas } = args;
  if (!rota?.id) return;
  const reg: RotaCacheada = {
    id: rota.id,
    empresa_id: rota.empresa_id,
    motorista_id: rota.motorista_id,
    rota,
    paradas,
    salvo_em: new Date().toISOString(),
  };
  await getDB().rota_ativa.put(reg);
}

/** Le o snapshot de uma rota especifica (por id). Null se nao houver. */
export async function lerRotaAtiva(rotaId: string): Promise<RotaCacheada | null> {
  if (!disponivel()) return null;
  return (await getDB().rota_ativa.get(rotaId)) ?? null;
}

/**
 * A rota cacheada mais recente (opcionalmente do motorista) — usada pra retomar
 * offline quando o app abre e nao consegue listar rotas do servidor.
 */
export async function lerUltimaRotaAtiva(motoristaId?: string): Promise<RotaCacheada | null> {
  if (!disponivel()) return null;
  const db = getDB();
  const todas = motoristaId
    ? await db.rota_ativa.where('motorista_id').equals(motoristaId).toArray()
    : await db.rota_ativa.toArray();
  if (todas.length === 0) return null;
  todas.sort((a, b) => b.salvo_em.localeCompare(a.salvo_em));
  return todas[0];
}

/**
 * Lista TODAS as rotas cacheadas (opcionalmente do motorista), mais recente
 * primeiro — usada pra montar a lista de rotas na tela inicial quando offline.
 */
export async function listarRotasCacheadas(motoristaId?: string): Promise<RotaCacheada[]> {
  if (!disponivel()) return [];
  const db = getDB();
  const todas = motoristaId
    ? await db.rota_ativa.where('motorista_id').equals(motoristaId).toArray()
    : await db.rota_ativa.toArray();
  return todas.sort((a, b) => b.salvo_em.localeCompare(a.salvo_em));
}

/** Remove o snapshot de uma rota (ex.: rota encerrada). */
export async function limparRotaAtiva(rotaId: string): Promise<void> {
  if (!disponivel()) return;
  await getDB().rota_ativa.delete(rotaId);
}

/** Limpa todos os snapshots de rota. Uso: logout / testes. */
export async function limparRotasAtivas(): Promise<void> {
  if (!disponivel()) return;
  await getDB().rota_ativa.clear();
}

/**
 * Fila offline — IndexedDB local (via Dexie) onde o motorista guarda as NFs
 * capturadas antes de sincronizar com o Supabase.
 *
 * Por que existe:
 * - Motorista escaneia 70 NFs no depósito (sinal de internet ruim).
 * - Quer ver "✓ 24 sincronizadas, ⏳ 2 pendentes" em tempo real.
 * - App pode ser fechado/reaberto sem perder dados.
 *
 * Estrutura: PK = `id_local` (UUID gerado no celular). Indexes em
 * `status_sync`, `motorista_id` e `capturado_em` pra queries comuns.
 *
 * BROWSER-ONLY (IndexedDB). Em SSR/node, getDB() lança — use guards.
 *
 * Referência: PLANO_ROTEIRIZACAO.md passo 1.2 + 0.5 (tipo NotaNaFila).
 */

import Dexie, { type Table } from 'dexie';
import type { NotaNaFila, StatusSync } from './types';

class FilaDB extends Dexie {
  notas!: Table<NotaNaFila, string>;

  constructor() {
    super('FrotaCapturaNotas');
    this.version(1).stores({
      // 'id_local' = PK; outros sao indexes secundarios pra queries comuns.
      notas: 'id_local, status_sync, motorista_id, capturado_em',
    });
  }
}

let _db: FilaDB | null = null;

/** Retorna a instancia da DB (singleton). Cria no primeiro uso. */
export function getDB(): FilaDB {
  if (!_db) _db = new FilaDB();
  return _db;
}

/** Permite injetar uma DB customizada (uso: testes). NAO usar em prod. */
export function _setDB(db: FilaDB | null): void {
  _db = db;
}

// ─── CRUD ───────────────────────────────────────────────────────────────

/** Adiciona uma NF capturada na fila (status_sync inicial: 'pendente'). */
export async function adicionarNota(nota: NotaNaFila): Promise<void> {
  await getDB().notas.add(nota);
}

/** Lista notas com status_sync === 'pendente'. Ordenadas por captura (ASC). */
export async function listarPendentes(): Promise<NotaNaFila[]> {
  const todas = await getDB().notas.where('status_sync').equals('pendente').toArray();
  return todas.sort((a, b) => a.capturado_em.localeCompare(b.capturado_em));
}

/** Lista notas com status_sync === 'erro' (que precisam retry depois). */
export async function listarComErro(): Promise<NotaNaFila[]> {
  return getDB().notas.where('status_sync').equals('erro').toArray();
}

/**
 * Lista todas as notas (opcionalmente filtradas por motorista).
 * Ordenadas por capturado_em DESC (mais recente primeiro).
 */
export async function listarTodas(motorista_id?: string): Promise<NotaNaFila[]> {
  const db = getDB();
  const todas = motorista_id
    ? await db.notas.where('motorista_id').equals(motorista_id).toArray()
    : await db.notas.toArray();
  return todas.sort((a, b) => b.capturado_em.localeCompare(a.capturado_em));
}

/** Conta totais por status (pra mostrar "✓ 24 ⏳ 2 ❌ 0" na UI). */
export async function contarPorStatus(): Promise<Record<StatusSync, number>> {
  const todas = await getDB().notas.toArray();
  const counts: Record<StatusSync, number> = { pendente: 0, sincronizada: 0, erro: 0 };
  for (const n of todas) counts[n.status_sync]++;
  return counts;
}

/** Busca uma nota pelo id_local. */
export async function buscarPorIdLocal(id_local: string): Promise<NotaNaFila | undefined> {
  return getDB().notas.get(id_local);
}

/**
 * Marca nota como sincronizada (guarda o id_servidor devolvido pelo backend).
 * Usado por sync.ts apos sucesso da requisicao.
 */
export async function marcarSincronizada(id_local: string, id_servidor: string): Promise<void> {
  await getDB().notas.update(id_local, {
    status_sync: 'sincronizada',
    id_servidor,
    proxima_tentativa: undefined,
    ultimo_erro: undefined,
  });
}

/**
 * Registra falha de sincronizacao: incrementa tentativas, salva erro, agenda
 * proxima tentativa via backoff exponencial. Muda status pra 'erro'.
 */
export async function registrarFalha(
  id_local: string,
  erro: string,
  proxima_tentativa_em_ms: number
): Promise<void> {
  const db = getDB();
  const nota = await db.notas.get(id_local);
  if (!nota) return;
  await db.notas.update(id_local, {
    tentativas: nota.tentativas + 1,
    ultimo_erro: erro,
    proxima_tentativa: new Date(Date.now() + proxima_tentativa_em_ms).toISOString(),
    status_sync: 'erro',
  });
}

/** Volta nota com status 'erro' pra 'pendente' (motorista pediu retry manual). */
export async function reenfileirar(id_local: string): Promise<void> {
  await getDB().notas.update(id_local, {
    status_sync: 'pendente',
    proxima_tentativa: undefined,
  });
}

/** Remove uma nota (motorista cancelou ou apos sincronizada hora muito antiga). */
export async function remover(id_local: string): Promise<void> {
  await getDB().notas.delete(id_local);
}

/**
 * Edita os dados de uma NF j\u00e1 capturada (endere\u00e7o, n\u00famero, observa\u00e7\u00e3o).
 * Reseta status_sync para 'pendente' para que o worker de sync reenvie ao servidor.
 * Limpa erros e contadores de tentativas anteriores.
 */
export async function editarNota(
  id_local: string,
  atualizacao: Partial<Pick<NotaNaFila, 'cep' | 'numero' | 'endereco' | 'observacao'>>
): Promise<void> {
  await getDB().notas.update(id_local, {
    ...atualizacao,
    status_sync: 'pendente',
    tentativas: 0,
    ultimo_erro: undefined,
    proxima_tentativa: undefined,
  });
}

/** Limpa todas as notas de um motorista específico da fila local. */
export async function limparFila(motorista_id: string): Promise<void> {
  const db = getDB();
  const ids = await db.notas.where('motorista_id').equals(motorista_id).primaryKeys();
  await db.notas.bulkDelete(ids);
}

/** Limpa toda a fila. Uso: testes e logout do motorista. */
export async function limparTudo(): Promise<void> {
  await getDB().notas.clear();
}


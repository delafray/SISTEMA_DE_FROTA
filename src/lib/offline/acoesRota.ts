/**
 * Fila de ACOES da rota feitas OFFLINE (IndexedDB via Dexie).
 *
 * O motorista, sem internet, toca "Concluir parada" ou "Encerrar rota". Antes
 * isso era um `fetch()` direto que falhava offline e revertia a UI — a baixa
 * sumia. Agora a acao entra nesta fila com o PATCH pronto (endpoint+corpo); a
 * UI segue otimista e o worker (syncAcoes.ts) reenvia quando a internet volta.
 *
 * Espelha o padrao da fila de notas (fila.ts): status_sync + backoff + retry.
 * Dedup: so uma acao PENDENTE por parada (concluir) e por rota (encerrar) — o
 * ultimo clique vence, nao acumula lixo.
 *
 * BROWSER-ONLY (IndexedDB). Em SSR/jsdom sem polyfill, as funcoes viram no-op
 * (retornam vazio / nao gravam) — igual rotaCache.ts.
 */

import { getDB } from './fila';
import type { AcaoRotaFila, TipoAcaoRota } from './types';

function disponivel(): boolean {
  return typeof indexedDB !== 'undefined';
}

function novoId(): string {
  // crypto.randomUUID existe em browsers modernos e no Node 19+. Fallback simples
  // pra ambientes sem ele (nunca colide na pratica desta fila local pequena).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `acao-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enfileira "concluir parada". Remove qualquer acao PENDENTE/ERRO anterior da
 * MESMA parada antes (o ultimo estado vence — evita reenviar baixas obsoletas).
 */
export async function enfileirarConcluirParada(args: {
  rota_id: string;
  parada_id: string;
  concluida_em: string;
}): Promise<AcaoRotaFila | null> {
  if (!disponivel()) return null;
  const db = getDB();
  const antigas = await db.acoes_rota
    .where('rota_id')
    .equals(args.rota_id)
    .filter((a) => a.tipo === 'concluir_parada' && a.parada_id === args.parada_id)
    .primaryKeys();
  if (antigas.length > 0) await db.acoes_rota.bulkDelete(antigas);

  const acao: AcaoRotaFila = {
    id_local: novoId(),
    tipo: 'concluir_parada',
    rota_id: args.rota_id,
    parada_id: args.parada_id,
    endpoint: `/api/routing/rota/${args.rota_id}/paradas`,
    metodo: 'PATCH',
    corpo: { paradas: [{ id: args.parada_id, concluida_em: args.concluida_em }] },
    status_sync: 'pendente',
    tentativas: 0,
    criado_em: new Date().toISOString(),
  };
  await db.acoes_rota.add(acao);
  return acao;
}

/**
 * Enfileira "encerrar rota". Remove acao de encerrar anterior da mesma rota
 * (so faz sentido encerrar uma vez).
 */
export async function enfileirarEncerrarRota(args: {
  rota_id: string;
}): Promise<AcaoRotaFila | null> {
  if (!disponivel()) return null;
  const db = getDB();
  const antigas = await db.acoes_rota
    .where('rota_id')
    .equals(args.rota_id)
    .filter((a) => a.tipo === 'encerrar_rota')
    .primaryKeys();
  if (antigas.length > 0) await db.acoes_rota.bulkDelete(antigas);

  const acao: AcaoRotaFila = {
    id_local: novoId(),
    tipo: 'encerrar_rota',
    rota_id: args.rota_id,
    parada_id: null,
    endpoint: `/api/routing/rota/${args.rota_id}`,
    metodo: 'PATCH',
    corpo: { status: 'concluida' },
    status_sync: 'pendente',
    tentativas: 0,
    criado_em: new Date().toISOString(),
  };
  await db.acoes_rota.add(acao);
  return acao;
}

/** Acoes pendentes, mais ANTIGA primeiro (ordem de aplicacao = ordem que ocorreram). */
export async function listarAcoesPendentes(): Promise<AcaoRotaFila[]> {
  if (!disponivel()) return [];
  const todas = await getDB().acoes_rota.where('status_sync').equals('pendente').toArray();
  return todas.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

/** Acoes com erro (backoff) — pra o worker retentar quando a hora chegar. */
export async function listarAcoesComErro(): Promise<AcaoRotaFila[]> {
  if (!disponivel()) return [];
  const todas = await getDB().acoes_rota.where('status_sync').equals('erro').toArray();
  return todas.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

/** Quantas acoes ainda nao foram pro servidor (pendente + erro) — uso: UI. */
export async function contarAcoesNaoSincronizadas(): Promise<number> {
  if (!disponivel()) return 0;
  const todas = await getDB().acoes_rota.toArray();
  return todas.filter((a) => a.status_sync !== 'sincronizada').length;
}

/** Acao sincronizada com sucesso → some da fila (nao precisa guardar id servidor). */
export async function marcarAcaoSincronizada(id_local: string): Promise<void> {
  if (!disponivel()) return;
  await getDB().acoes_rota.delete(id_local);
}

/**
 * Falha ao enviar: incrementa tentativas, salva erro, agenda backoff, status=erro.
 * No-op silencioso se a acao ja sumiu (ex.: foi deduplicada por um clique novo).
 */
export async function registrarFalhaAcao(
  id_local: string,
  erro: string,
  proxima_tentativa_em_ms: number
): Promise<void> {
  if (!disponivel()) return;
  const db = getDB();
  const acao = await db.acoes_rota.get(id_local);
  if (!acao) return;
  await db.acoes_rota.update(id_local, {
    tentativas: acao.tentativas + 1,
    ultimo_erro: erro,
    proxima_tentativa: new Date(Date.now() + proxima_tentativa_em_ms).toISOString(),
    status_sync: 'erro',
  });
}

/** Limpa toda a fila de acoes. Uso: testes. (Logout NAO limpa — ver decisao no app.) */
export async function limparAcoes(): Promise<void> {
  if (!disponivel()) return;
  await getDB().acoes_rota.clear();
}

/** Re-exporta o tipo pra quem importa daqui (conveniencia). */
export type { AcaoRotaFila, TipoAcaoRota };

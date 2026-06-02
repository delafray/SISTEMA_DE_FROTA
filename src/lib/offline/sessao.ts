/**
 * Sessao local (IndexedDB) — permite o motorista operar OFFLINE por alguns dias.
 *
 * Fluxo:
 * - Online, ao autenticar com sucesso: `salvarSessaoLocal()` grava o perfil minimo.
 * - Offline, quando `getUser()` falha: `lerSessaoLocal()` devolve o perfil salvo
 *   SE ainda estiver dentro do TTL (7 dias). Senao devolve null (→ exige login online).
 *
 * Ver tipo `SessaoLocal` e nota de seguranca em ./types.ts.
 * BROWSER-ONLY (IndexedDB). Em SSR/jsdom sem polyfill, as funcoes viram no-op.
 */

import { getDB } from './fila';
import type { SessaoLocal } from './types';

/** Validade da sessao offline: 7 dias desde o ultimo login online. */
export const SESSAO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** PK fixa — so existe uma sessao local por dispositivo. */
const SESSAO_ID = 'atual';

/** True se IndexedDB existe no ambiente (false em SSR/jsdom sem polyfill). */
function disponivel(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * True se a sessao passou da validade (>7 dias desde `salvo_em`). PURA.
 * Data corrompida/invalida tambem conta como expirada (fail-safe).
 */
export function sessaoExpirada(
  sessao: Pick<SessaoLocal, 'salvo_em'>,
  agoraMs: number = Date.now()
): boolean {
  const salvoMs = new Date(sessao.salvo_em).getTime();
  if (Number.isNaN(salvoMs)) return true;
  return agoraMs - salvoMs > SESSAO_TTL_MS;
}

/** Dados do perfil que persistimos (sem id/salvo_em, preenchidos aqui). */
export type PerfilParaSalvar = Omit<SessaoLocal, 'id' | 'salvo_em'>;

/** Persiste/renova o perfil pra acesso offline. Sobrescreve a sessao anterior. */
export async function salvarSessaoLocal(perfil: PerfilParaSalvar): Promise<void> {
  if (!disponivel()) return;
  const sessao: SessaoLocal = {
    ...perfil,
    id: SESSAO_ID,
    salvo_em: new Date().toISOString(),
  };
  await getDB().sessao_local.put(sessao);
}

/**
 * Le a sessao local se existir e estiver valida. Senao devolve null.
 * Quando expirada, apaga o registro (limpeza preguicosa).
 */
export async function lerSessaoLocal(agoraMs: number = Date.now()): Promise<SessaoLocal | null> {
  if (!disponivel()) return null;
  const sessao = await getDB().sessao_local.get(SESSAO_ID);
  if (!sessao) return null;
  if (sessaoExpirada(sessao, agoraMs)) {
    await getDB().sessao_local.delete(SESSAO_ID);
    return null;
  }
  return sessao;
}

/** Remove a sessao local (logout — corta o acesso offline imediatamente). */
export async function limparSessaoLocal(): Promise<void> {
  if (!disponivel()) return;
  await getDB().sessao_local.delete(SESSAO_ID);
}

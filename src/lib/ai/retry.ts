/**
 * Retry com backoff exponencial pra chamadas externas (Gemini, Deepgram).
 *
 * NUNCA retry em erro de validacao (4xx ou erro do usuario). Apenas:
 *  - Network errors (fetch failed, ECONNRESET, etc)
 *  - 5xx do servidor
 *  - 429 rate limit (com backoff mais longo)
 *
 * Padrao: 2 tentativas adicionais (3 total), 1s + 3s. Total max ~4s.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('retry');

export interface OpcoesRetry {
  /** Quantas tentativas adicionais alem da primeira. Default 2 (total 3). */
  tentativas?: number;
  /** Backoffs em ms entre tentativas. Default [1000, 3000]. */
  backoffsMs?: number[];
  /** Nome da operacao pra logging. */
  nome?: string;
  /** Predicado: dado um erro, devo tentar de novo? Default: erros de rede + 5xx. */
  deveRetentar?: (err: unknown) => boolean;
}

/** Heuristica padrao: retentar em network/timeout/5xx, NUNCA em 4xx ou erro de validacao. */
function deveRetentarPadrao(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  // Network
  if (
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('aborted')
  ) {
    return true;
  }
  // 5xx ou 429 (rate limit)
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504') || lower.includes('429')) {
    return true;
  }
  return false;
}

/**
 * Executa fn() com retry+backoff. Sucesso: retorna o valor. Falha apos
 * todas tentativas: relanca o ultimo erro.
 */
export async function comRetry<T>(
  fn: () => Promise<T>,
  opcoes: OpcoesRetry = {}
): Promise<T> {
  const tentativas = opcoes.tentativas ?? 2;
  const backoffsMs = opcoes.backoffsMs ?? [1000, 3000];
  const nome = opcoes.nome ?? 'op';
  const deveRetentar = opcoes.deveRetentar ?? deveRetentarPadrao;

  let ultimoErro: unknown;
  for (let i = 0; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (i >= tentativas) {
        log.warn('retry_esgotado', { nome, tentativas_feitas: i + 1, erro: (err as Error).message });
        throw err;
      }
      if (!deveRetentar(err)) {
        // Erro nao-retentavel (4xx, validacao) — desiste imediato
        throw err;
      }
      const espera = backoffsMs[i] ?? backoffsMs[backoffsMs.length - 1] ?? 1000;
      log.info('retry_aguardando', { nome, tentativa: i + 1, espera_ms: espera, motivo: (err as Error).message?.slice(0, 80) });
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  // Inalcancavel — o loop sempre retorna ou lanca
  throw ultimoErro;
}

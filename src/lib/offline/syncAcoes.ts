/**
 * Sync worker das ACOES da rota — reenvia "concluir parada" / "encerrar rota"
 * que o motorista fez offline, na ordem em que ocorreram.
 *
 * Espelha sync.ts (notas), mas:
 * - Cada acao ja carrega endpoint + metodo + corpo prontos (reexecuta o PATCH).
 * - Sucesso → remove da fila (acao nao tem id_servidor pra guardar).
 * - Falha → backoff exponencial (5s, 10s, 20s, 40s, 80s) ate MAX_TENTATIVAS.
 * - Processa em ORDEM (criado_em ASC) pra "concluir" vir antes de "encerrar".
 *
 * Roda em foreground (setInterval enquanto a tela em_rota esta aberta) e e
 * disparado tambem no evento `online`. Nao depende de Background Sync (iOS nao
 * suporta).
 */

import {
  listarAcoesPendentes,
  listarAcoesComErro,
  marcarAcaoSincronizada,
  registrarFalhaAcao,
} from './acoesRota';
import type { AcaoRotaFila } from './types';

const BATCH_SIZE = 10;
const MAX_TENTATIVAS = 5;
const BACKOFF_BASE_MS = 5000; // 5s × 2^tentativas

let _syncInProgress = false;
let _intervalId: ReturnType<typeof setInterval> | null = null;

export interface SyncAcoesResult {
  tentadas: number;
  sucesso: number;
  erro: number;
}

/** True se a acao deve ser tentada agora (passou backoff e nao excedeu tentativas). */
function deveTentarAgora(acao: AcaoRotaFila): boolean {
  if (acao.tentativas >= MAX_TENTATIVAS) return false;
  if (!acao.proxima_tentativa) return true;
  return new Date(acao.proxima_tentativa).getTime() <= Date.now();
}

/** Une pendentes + com-erro cujo backoff expirou, em ordem cronologica. */
async function selecionarParaEnviar(): Promise<AcaoRotaFila[]> {
  const [pendentes, comErro] = await Promise.all([
    listarAcoesPendentes(),
    listarAcoesComErro(),
  ]);
  const todas = [...pendentes, ...comErro]
    .filter(deveTentarAgora)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  return todas.slice(0, BATCH_SIZE);
}

/**
 * Tenta sincronizar uma rodada da fila de acoes. Devolve estatisticas.
 * Faz nada (zeros) se: ja ha sync em andamento, ou navigator.onLine === false.
 */
export async function sincronizarAcoes(): Promise<SyncAcoesResult> {
  if (_syncInProgress) return { tentadas: 0, sucesso: 0, erro: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { tentadas: 0, sucesso: 0, erro: 0 };
  }

  _syncInProgress = true;
  try {
    const aTentar = await selecionarParaEnviar();
    if (aTentar.length === 0) return { tentadas: 0, sucesso: 0, erro: 0 };

    let sucesso = 0;
    let erro = 0;

    // Sequencial e em ordem: "concluir parada" precisa valer antes de "encerrar".
    for (const acao of aTentar) {
      try {
        const res = await fetch(acao.endpoint, {
          method: acao.metodo,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acao.corpo),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => 'unknown');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        // Algumas rotas devolvem { ok:false, erros:[...] } com HTTP 200.
        const data = await res.json().catch(() => ({}));
        if (data && data.ok === false) {
          throw new Error(`rejeitada: ${JSON.stringify(data.erros ?? data).slice(0, 200)}`);
        }
        await marcarAcaoSincronizada(acao.id_local);
        sucesso++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const backoff = BACKOFF_BASE_MS * Math.pow(2, acao.tentativas);
        await registrarFalhaAcao(acao.id_local, msg, backoff);
        erro++;
      }
    }

    return { tentadas: aTentar.length, sucesso, erro };
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Inicia worker em foreground (setInterval). Retorna funcao pra parar.
 * Idempotente: chamar de novo nao cria intervalos extras. Dispara uma vez ja.
 */
export function iniciarSyncAcoesWorker(intervaloMs = 8000): () => void {
  if (_intervalId) return stopSyncAcoesWorker;
  _intervalId = setInterval(() => {
    void sincronizarAcoes();
  }, intervaloMs);
  void sincronizarAcoes();
  return stopSyncAcoesWorker;
}

/** Para o worker. Pode ser chamado mesmo sem worker rodando. */
export function stopSyncAcoesWorker(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

/** True se o worker esta rodando (uso: UI/testes). */
export function workerAcoesAtivo(): boolean {
  return _intervalId !== null;
}

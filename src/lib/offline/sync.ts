/**
 * Sync worker — envia notas pendentes da fila local pro Supabase via API route.
 *
 * Fluxo:
 * 1. Lê fila local (status 'pendente' ou 'erro' com proxima_tentativa <= now).
 * 2. Envia em batch (max BATCH_SIZE) pra `POST /api/notas/sync`.
 * 3. Sucesso → marcarSincronizada com id_servidor.
 * 4. Falha → registrarFalha com backoff exponencial (5s, 10s, 20s, 40s, 80s).
 * 5. Apos MAX_TENTATIVAS, para de tentar (motorista vai precisar agir manualmente).
 *
 * Roda em foreground (setInterval enquanto app aberto). Funciona iPhone E
 * Android — não depende de Background Sync API (iOS Safari não suporta).
 *
 * Referência: PLANO_ROTEIRIZACAO.md secao 3.8 (Foreground Queue) + passo 1.2.
 */

import { listarPendentes, listarComErro, marcarSincronizada, registrarFalha } from './fila';
import type { NotaNaFila } from './types';

const SYNC_ENDPOINT = '/api/notas/sync';
const BATCH_SIZE = 10;
const MAX_TENTATIVAS = 5;
const BACKOFF_BASE_MS = 5000; // 5s × 2^tentativas

let _syncInProgress = false;
let _intervalId: ReturnType<typeof setInterval> | null = null;

export interface SyncResult {
  tentadas: number;
  sucesso: number;
  erro: number;
  pulados: number;
}

/** True se a nota deve ser tentada agora (passou backoff e nao excedeu tentativas). */
function deveTentarAgora(nota: NotaNaFila): boolean {
  if (nota.tentativas >= MAX_TENTATIVAS) return false;
  if (!nota.proxima_tentativa) return true;
  return new Date(nota.proxima_tentativa).getTime() <= Date.now();
}

/** Une notas pendentes + notas com erro cujo backoff ja expirou. */
async function selecionarParaEnviar(): Promise<NotaNaFila[]> {
  const [pendentes, comErro] = await Promise.all([listarPendentes(), listarComErro()]);
  const todas = [...pendentes, ...comErro];
  return todas.filter(deveTentarAgora).slice(0, BATCH_SIZE);
}

/**
 * Tenta sincronizar uma rodada da fila. Devolve estatisticas.
 * Pode ser chamada manualmente ou via setInterval (iniciarSyncWorker).
 *
 * Faz nada (retorna zeros) se:
 * - Ja tem sync em andamento (evita race condition)
 * - navigator.onLine === false
 */
export async function sincronizarFila(): Promise<SyncResult> {
  if (_syncInProgress) {
    return { tentadas: 0, sucesso: 0, erro: 0, pulados: 0 };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { tentadas: 0, sucesso: 0, erro: 0, pulados: 0 };
  }

  _syncInProgress = true;
  try {
    const aTentar = await selecionarParaEnviar();
    if (aTentar.length === 0) {
      return { tentadas: 0, sucesso: 0, erro: 0, pulados: 0 };
    }

    let sucesso = 0;
    let erro = 0;

    for (const nota of aTentar) {
      try {
        const res = await fetch(SYNC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_local: nota.id_local,
            motorista_id: nota.motorista_id,
            empresa_id: nota.empresa_id,
            cep: nota.cep,
            numero: nota.numero,
            endereco: nota.endereco,
            latitude: nota.latitude,
            longitude: nota.longitude,
            observacao: nota.observacao,
            capturado_em: nota.capturado_em,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => 'unknown');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = (await res.json()) as { id_servidor: string };
        if (!data.id_servidor) {
          throw new Error('resposta sem id_servidor');
        }

        await marcarSincronizada(nota.id_local, data.id_servidor);
        sucesso++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const backoff = BACKOFF_BASE_MS * Math.pow(2, nota.tentativas);
        await registrarFalha(nota.id_local, msg, backoff);
        erro++;
      }
    }

    return {
      tentadas: aTentar.length,
      sucesso,
      erro,
      pulados: 0,
    };
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Inicia worker em foreground (setInterval a cada intervaloMs).
 * Retorna funcao pra parar.
 * Idempotente: chamar de novo nao cria intervalos extras.
 */
export function iniciarSyncWorker(intervaloMs = 5000): () => void {
  if (_intervalId) return stopSyncWorker;
  _intervalId = setInterval(() => {
    void sincronizarFila();
  }, intervaloMs);
  // Dispara uma vez imediatamente
  void sincronizarFila();
  return stopSyncWorker;
}

/** Para o worker. Pode ser chamado mesmo sem worker rodando. */
export function stopSyncWorker(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

/** True se o worker esta rodando (uso: UI). */
export function workerAtivo(): boolean {
  return _intervalId !== null;
}

/**
 * Cliente VROOM — otimiza a ordem das paradas (Vehicle Routing Problem).
 *
 * VROOM e auto-hospedado na mesma VM do OSRM (Oracle). Recebe veiculos +
 * jobs e devolve a ordem otima das paradas pra cada veiculo, respeitando
 * restricoes (janela de horario, prioridade, skills, capacidade).
 *
 * Documentacao: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
 *
 * SERVER-ONLY: usa VROOM_URL do env.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.8 + 1.9 (restricoes).
 */

import { createLogger } from '@/lib/logger';
import type { Coordenada, JanelaHorario, ResultadoVROOM } from './types';

const log = createLogger('vroom');

const TIMEOUT_MS = 30000; // VROOM pode demorar com 70 paradas

// ─── TIPOS PUBLICOS ─────────────────────────────────────────────────

export interface Veiculo {
  id: number;
  inicio: Coordenada;
  fim?: Coordenada;       // opcional — default = mesmo lugar do inicio
  capacidade?: number[];  // ex: [10] = 10 unidades de carga (opcional)
  skills?: number[];      // ex: [1] = pode atender jobs com skill 1 (opcional)
}

export interface Job {
  id: number;             // ID numerico (VROOM exige) — mapear pra id_local fora
  localizacao: Coordenada;
  tempo_descarga_s?: number;   // default 300s (5min)
  janelas?: JanelaHorario;     // [["09:00","12:00"], ...] em formato HH:MM
  prioridade?: number;         // 0-100, default 0
  skills?: number[];           // requer veiculo com essas skills
  amount?: number[];           // carga que ocupa (default 1)
}

export type ResultadoOtimizar =
  | { ok: true; resultado: ResultadoVROOM }
  | { ok: false; motivo: 'config_faltando' | 'sem_solucao' | 'erro_rede' | 'timeout' };

// ─── TIPOS INTERNOS (formato VROOM) ─────────────────────────────────

interface VroomJobPayload {
  id: number;
  location: [number, number];        // [lng, lat]
  service?: number;                  // segundos
  time_windows?: [number, number][]; // [unix_start, unix_end]
  priority?: number;
  skills?: number[];
  amount?: number[];
}

interface VroomVehiclePayload {
  id: number;
  start: [number, number];
  end?: [number, number];
  capacity?: number[];
  skills?: number[];
}

interface VroomResponse {
  code: number;                      // 0 = sucesso
  routes?: Array<{
    vehicle: number;
    steps: Array<{
      type: 'start' | 'job' | 'end';
      job?: number;                  // id do job
      arrival: number;               // unix timestamp
      distance: number;
    }>;
    distance: number;
    duration: number;
  }>;
  unassigned?: Array<{ id: number; type: string }>;
  summary?: { distance: number; duration: number };
}

// ─── HELPERS ────────────────────────────────────────────────────────

function getBaseUrl(): string | null {
  const url = process.env.VROOM_URL;
  if (!url) return null;
  return url.replace(/\/$/, '');
}

/**
 * Converte janela "HH:MM" pra unix timestamp do dia atual.
 * VROOM usa unix seconds em time_windows.
 */
export function janelaParaUnixDoDia(
  janela: JanelaHorario,
  dataBase = new Date()
): [number, number][] {
  const base = new Date(dataBase);
  base.setHours(0, 0, 0, 0);
  const baseEpochS = Math.floor(base.getTime() / 1000);
  return janela.map(([inicio, fim]) => {
    const [hI, mI] = inicio.split(':').map(Number);
    const [hF, mF] = fim.split(':').map(Number);
    return [baseEpochS + hI * 3600 + mI * 60, baseEpochS + hF * 3600 + mF * 60];
  });
}

function jobParaVroom(job: Job, dataBase = new Date()): VroomJobPayload {
  const payload: VroomJobPayload = {
    id: job.id,
    location: [job.localizacao.lng, job.localizacao.lat],
    service: job.tempo_descarga_s ?? 300,
  };
  if (job.janelas) payload.time_windows = janelaParaUnixDoDia(job.janelas, dataBase);
  if (typeof job.prioridade === 'number') payload.priority = job.prioridade;
  if (job.skills?.length) payload.skills = job.skills;
  if (job.amount?.length) payload.amount = job.amount;
  return payload;
}

function veiculoParaVroom(v: Veiculo): VroomVehiclePayload {
  const payload: VroomVehiclePayload = {
    id: v.id,
    start: [v.inicio.lng, v.inicio.lat],
  };
  if (v.fim) payload.end = [v.fim.lng, v.fim.lat];
  if (v.capacidade?.length) payload.capacity = v.capacidade;
  if (v.skills?.length) payload.skills = v.skills;
  return payload;
}

// ─── FUNCAO PRINCIPAL ───────────────────────────────────────────────

/**
 * Otimiza a ordem das paradas (jobs) pros veiculos dados.
 * Devolve a ordem visitada por veiculo + paradas nao atendidas.
 */
export async function otimizarRota(input: {
  veiculos: Veiculo[];
  jobs: Job[];
  dataBase?: Date;
}): Promise<ResultadoOtimizar> {
  if (input.jobs.length === 0 || input.veiculos.length === 0) {
    return { ok: false, motivo: 'sem_solucao' };
  }

  const base = getBaseUrl();
  if (!base) {
    log.warn('vroom_url_nao_configurada');
    return { ok: false, motivo: 'config_faltando' };
  }

  const body = {
    vehicles: input.veiculos.map(veiculoParaVroom),
    jobs: input.jobs.map((j) => jobParaVroom(j, input.dataBase)),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('vroom_http_error', { status: res.status });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as VroomResponse;

    if (data.code !== 0 || !data.routes || data.routes.length === 0) {
      log.info('vroom_sem_solucao', { code: data.code });
      return { ok: false, motivo: 'sem_solucao' };
    }

    // Achata as rotas em uma lista ordenada de paradas
    const paradas: ResultadoVROOM['paradas'] = [];
    let ordem = 1;
    for (const route of data.routes) {
      for (const step of route.steps) {
        if (step.type === 'job' && typeof step.job === 'number') {
          paradas.push({
            nota_id: String(step.job),
            ordem,
            chegada_estimada: new Date(step.arrival * 1000).toISOString(),
          });
          ordem++;
        }
      }
    }

    const naoAtendidas = (data.unassigned ?? []).map((u) => String(u.id));

    return {
      ok: true,
      resultado: {
        paradas,
        distancia_total_km: (data.summary?.distance ?? 0) / 1000,
        tempo_total_min: (data.summary?.duration ?? 0) / 60,
        paradas_nao_atendidas: naoAtendidas,
      },
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('vroom_timeout', { timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('vroom_network_error', { error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

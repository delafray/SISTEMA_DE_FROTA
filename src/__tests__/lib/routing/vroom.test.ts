/**
 * Testes do cliente VROOM (otimizacao de rota).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  otimizarRota,
  janelaParaUnixDoDia,
  type Veiculo,
  type Job,
} from '@/lib/routing/vroom';

const DEPOSITO = { lat: -23.5505, lng: -46.6333 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.VROOM_URL = 'http://test-vroom:3000';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetchVroomOk(opts: {
  paradas: Array<{ vehicle: number; jobs: number[] }>;
  distance?: number;
  duration?: number;
  unassigned?: number[];
}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      code: 0,
      summary: { distance: opts.distance ?? 10000, duration: opts.duration ?? 600 },
      routes: opts.paradas.map((r) => ({
        vehicle: r.vehicle,
        distance: 10000,
        duration: 600,
        steps: [
          { type: 'start', arrival: 1700000000 },
          ...r.jobs.map((jobId, i) => ({
            type: 'job' as const,
            job: jobId,
            arrival: 1700000000 + (i + 1) * 600,
            distance: 1000 * (i + 1),
          })),
          { type: 'end', arrival: 1700010000 },
        ],
      })),
      unassigned: (opts.unassigned ?? []).map((id) => ({ id, type: 'job' })),
    }),
  });
}

describe('janelaParaUnixDoDia', () => {
  it('converte ["09:00","12:00"] em [unix_inicio, unix_fim]', () => {
    const base = new Date('2026-05-28T15:00:00Z');
    const r = janelaParaUnixDoDia([['09:00', '12:00']], base);
    expect(r).toHaveLength(1);
    const [inicio, fim] = r[0];
    expect(fim - inicio).toBe(3 * 3600); // 3h
  });

  it('converte multiplas janelas', () => {
    const r = janelaParaUnixDoDia([
      ['09:00', '12:00'],
      ['14:00', '18:00'],
    ]);
    expect(r).toHaveLength(2);
    expect(r[1][1] - r[1][0]).toBe(4 * 3600);
  });
});

describe('otimizarRota — validacao', () => {
  it('sem_solucao quando nao tem jobs', async () => {
    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [],
    });
    expect(r).toEqual({ ok: false, motivo: 'sem_solucao' });
  });

  it('sem_solucao quando nao tem veiculos', async () => {
    const r = await otimizarRota({
      veiculos: [],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });
    expect(r).toEqual({ ok: false, motivo: 'sem_solucao' });
  });

  it('config_faltando quando VROOM_URL nao definido', async () => {
    delete process.env.VROOM_URL;
    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });
    expect(r).toEqual({ ok: false, motivo: 'config_faltando' });
  });
});

describe('otimizarRota — sucesso', () => {
  it('1 veiculo, 3 jobs → ordem otimizada com 3 paradas', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchVroomOk({
        paradas: [{ vehicle: 1, jobs: [2, 3, 1] }],
        distance: 15000,
        duration: 1800,
      })
    );

    const veiculos: Veiculo[] = [{ id: 1, inicio: DEPOSITO }];
    const jobs: Job[] = [
      { id: 1, localizacao: { lat: -23.5, lng: -46.6 } },
      { id: 2, localizacao: { lat: -23.6, lng: -46.7 } },
      { id: 3, localizacao: { lat: -23.7, lng: -46.8 } },
    ];

    const r = await otimizarRota({ veiculos, jobs });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado.paradas).toHaveLength(3);
      expect(r.resultado.paradas.map((p) => p.nota_id)).toEqual(['2', '3', '1']);
      expect(r.resultado.paradas.map((p) => p.ordem)).toEqual([1, 2, 3]);
      expect(r.resultado.distancia_total_km).toBe(15);
      expect(r.resultado.tempo_total_min).toBe(30);
      expect(r.resultado.paradas_nao_atendidas).toEqual([]);
    }
  });

  it('paradas_nao_atendidas tem ids do unassigned', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchVroomOk({
        paradas: [{ vehicle: 1, jobs: [1, 2] }],
        unassigned: [3, 4],
      })
    );

    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [
        { id: 1, localizacao: DEPOSITO },
        { id: 2, localizacao: DEPOSITO },
        { id: 3, localizacao: DEPOSITO },
        { id: 4, localizacao: DEPOSITO },
      ],
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado.paradas_nao_atendidas).toEqual(['3', '4']);
    }
  });

  it('multiplos veiculos — paradas sao reordenadas sequencialmente', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchVroomOk({
        paradas: [
          { vehicle: 1, jobs: [1, 2] },
          { vehicle: 2, jobs: [3] },
        ],
      })
    );

    const r = await otimizarRota({
      veiculos: [
        { id: 1, inicio: DEPOSITO },
        { id: 2, inicio: DEPOSITO },
      ],
      jobs: [
        { id: 1, localizacao: DEPOSITO },
        { id: 2, localizacao: DEPOSITO },
        { id: 3, localizacao: DEPOSITO },
      ],
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado.paradas.map((p) => p.ordem)).toEqual([1, 2, 3]);
    }
  });

  it('envia POST com body correto (jobs com location lng,lat)', async () => {
    const fetchMock = mockFetchVroomOk({ paradas: [{ vehicle: 1, jobs: [1] }] });
    vi.stubGlobal('fetch', fetchMock);

    await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: { lat: -23.5, lng: -46.6 } }],
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.vehicles[0].start).toEqual([-46.6333, -23.5505]); // [lng, lat]
    expect(body.jobs[0].location).toEqual([-46.6, -23.5]);
    expect(body.jobs[0].service).toBe(300); // default 5min
  });

  it('aplica janela_horario do job no payload', async () => {
    const fetchMock = mockFetchVroomOk({ paradas: [{ vehicle: 1, jobs: [1] }] });
    vi.stubGlobal('fetch', fetchMock);

    await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [
        {
          id: 1,
          localizacao: DEPOSITO,
          janelas: [['09:00', '12:00']],
        },
      ],
      dataBase: new Date('2026-05-28T15:00:00Z'),
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.jobs[0].time_windows).toBeDefined();
    expect(body.jobs[0].time_windows).toHaveLength(1);
  });

  it('aplica prioridade e skills no payload', async () => {
    const fetchMock = mockFetchVroomOk({ paradas: [{ vehicle: 1, jobs: [1] }] });
    vi.stubGlobal('fetch', fetchMock);

    await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO, skills: [1] }],
      jobs: [
        {
          id: 1,
          localizacao: DEPOSITO,
          prioridade: 50,
          skills: [1],
          tempo_descarga_s: 600,
        },
      ],
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.jobs[0].priority).toBe(50);
    expect(body.jobs[0].skills).toEqual([1]);
    expect(body.jobs[0].service).toBe(600);
    expect(body.vehicles[0].skills).toEqual([1]);
  });
});

describe('otimizarRota — erros', () => {
  it('code != 0 → sem_solucao', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 1, routes: [] }),
      })
    );

    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });

    expect(r).toEqual({ ok: false, motivo: 'sem_solucao' });
  });

  it('HTTP 500 → erro_rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });

  it('timeout → motivo timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      })
    );

    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });

    expect(r).toEqual({ ok: false, motivo: 'timeout' });
  });

  it('fetch reject → erro_rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnreset')));

    const r = await otimizarRota({
      veiculos: [{ id: 1, inicio: DEPOSITO }],
      jobs: [{ id: 1, localizacao: DEPOSITO }],
    });

    expect(r).toEqual({ ok: false, motivo: 'erro_rede' });
  });
});

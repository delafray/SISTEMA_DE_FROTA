import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.OVERPASS_URL = 'http://test-overpass/api/interpreter';

import { consultarEnderecos } from '@/lib/routing/overpass/client';

const fetchOriginal = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = fetchOriginal;
});

describe('consultarEnderecos', () => {
  it('sucesso: parseia CSV em array de enderecos', async () => {
    const csv = '5771,-19.939,-43.931\n7315,-19.937,-43.945\n104A,-19.92,-43.93\n';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => csv,
    } as unknown as Response);

    const r = await consultarEnderecos(-19.92, -43.93, 'Av do Contorno');

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enderecos).toEqual([
        { numero: 5771, lat: -19.939, lng: -43.931 },
        { numero: 7315, lat: -19.937, lng: -43.945 },
        { numero: 104, lat: -19.92, lng: -43.93 }, // "104A" → extrai "104"
      ]);
    }
  });

  it('envia bbox correto pro Overpass', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    await consultarEnderecos(-19.92, -43.93, 'Av Contorno');

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    // bbox = (lat-0.05, lng-0.05, lat+0.05, lng+0.05) = (-19.97, -43.98, -19.87, -43.88)
    expect(body).toContain('-19.97');
    expect(body).toContain('-43.98');
    expect(body).toContain('-19.87');
    expect(body).toContain('-43.88');
    // Regex case-insensitive
    expect(body).toContain('contorno');
  });

  it('coords invalidas → erro sem_coords (sem chamar fetch)', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const r = await consultarEnderecos(NaN, 0, 'Av Brasil');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('sem_coords');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rua muito curta → erro rua_invalida', async () => {
    const r = await consultarEnderecos(-19.9, -43.9, 'a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('rua_invalida');
  });

  it('HTTP 500 → erro http_error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response) as typeof fetch;

    const r = await consultarEnderecos(-19.9, -43.9, 'Av Brasil');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('http_error');
      expect(r.detalhe).toContain('500');
    }
  });

  it('erro de rede → erro_rede', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused')) as typeof fetch;

    const r = await consultarEnderecos(-19.9, -43.9, 'Av Brasil');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('erro_rede');
      expect(r.detalhe).toBe('connection refused');
    }
  });

  it('linhas malformadas no CSV sao ignoradas', async () => {
    const csv = '100,-19.9,-43.9\nlixo,sem,sentido\n200,-19.91,-43.91\n,,,\n';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => csv,
    } as unknown as Response) as typeof fetch;

    const r = await consultarEnderecos(-19.9, -43.9, 'Av Brasil');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.enderecos).toHaveLength(2);
  });
});

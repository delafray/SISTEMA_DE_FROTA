/**
 * Testes da API route POST /api/routing/geocodar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/routing/geocoding', () => ({
  geocodar: vi.fn(),
}));

import { POST } from '@/app/api/routing/geocodar/route';
import { geocodar } from '@/lib/routing/geocoding';
import { NextRequest } from 'next/server';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/geocodar', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/routing/geocodar — sucesso', () => {
  it('200 com lat/lng/endereco_normalizado', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      resultado: {
        lat: -23.561,
        lng: -46.6565,
        endereco_normalizado: 'Avenida Paulista, Sao Paulo, SP, Brasil',
      },
    });

    const res = await POST(makeReq({ endereco: 'Avenida Paulista, 1500, SP' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resultado.lat).toBe(-23.561);
    expect(body.resultado.lng).toBe(-46.6565);
    expect(geocodar).toHaveBeenCalledWith('Avenida Paulista, 1500, SP');
  });
});

describe('POST /api/routing/geocodar — validacao 400', () => {
  it('JSON invalido → 400 json_invalido', async () => {
    const res = await POST(makeReq('{ nao e json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('json_invalido');
  });

  it('endereco faltando → 400 campo_obrigatorio', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('campo_obrigatorio');
  });

  it('endereco nao-string → 400', async () => {
    const res = await POST(makeReq({ endereco: 123 }));
    expect(res.status).toBe(400);
  });

  it('endereco_invalido do geocoder → 400', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'endereco_invalido',
    });
    const res = await POST(makeReq({ endereco: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('nao_encontrado do geocoder → 400', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'nao_encontrado',
    });
    const res = await POST(makeReq({ endereco: 'rua que nao existe xyz' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/routing/geocodar — erro 503', () => {
  it('erro_rede → 503', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'erro_rede',
    });
    const res = await POST(makeReq({ endereco: 'X teste teste' }));
    expect(res.status).toBe(503);
  });

  it('timeout → 503', async () => {
    (geocodar as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'timeout',
    });
    const res = await POST(makeReq({ endereco: 'X teste teste' }));
    expect(res.status).toBe(503);
  });
});

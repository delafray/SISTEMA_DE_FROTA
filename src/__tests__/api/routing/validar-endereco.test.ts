import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  validar: vi.fn(),
  geocodar: vi.fn(),
}));

vi.mock('@/lib/routing/overpass/validar', () => ({
  validarNumero: mocks.validar,
}));
vi.mock('@/lib/routing/geocoding', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    geocodar: mocks.geocodar,
  };
});

import { POST } from '@/app/api/routing/validar-endereco/route';
import { NextRequest } from 'next/server';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/routing/validar-endereco', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const corpo = {
  cep: '30130-010',
  numero: '5000',
  endereco: {
    logradouro: 'Avenida do Contorno',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    uf: 'MG',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('POST validar-endereco', () => {
  it('sucesso: chama geocoding + validar e devolve resultado', async () => {
    mocks.geocodar.mockResolvedValue({
      ok: true,
      resultado: { lat: -19.92, lng: -43.93, endereco_normalizado: 'Av Contorno' },
    });
    mocks.validar.mockResolvedValue({
      status: 'confirmado',
      coordenada: { lat: -19.92, lng: -43.93 },
      mensagem: 'Numero confirmado.',
      dados: { quantidade: 100, min: 1, max: 8000, numeros: [], confianca: 'alta' },
      cacheado: false,
    });

    const res = await POST(req(corpo));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('confirmado');
    expect(body.coordenada).toEqual({ lat: -19.92, lng: -43.93 });
    expect(body.dados.confianca).toBe('alta');
  });

  it('campos faltando → 400', async () => {
    const res = await POST(req({ cep: '30130010' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('campos_obrigatorios');
  });

  it('JSON invalido → 400', async () => {
    const res = await POST(req('{ broken'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('json_invalido');
  });

  it('geocoding falha → 200 com status sem_dados (NAO bloqueia)', async () => {
    mocks.geocodar.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const res = await POST(req(corpo));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('sem_dados');
    expect(mocks.validar).not.toHaveBeenCalled();
  });
});

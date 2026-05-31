/**
 * Testes da API route POST /api/routing/coord-aprendida.
 * Mocka coordsAprendidas (gravar + chaveEndereco).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  gravar: vi.fn(),
  chave: vi.fn(),
}));

vi.mock('@/lib/routing/coordsAprendidas', () => ({
  gravarCoordAprendida: mocks.gravar,
  chaveEndereco: mocks.chave,
}));

import { POST } from '@/app/api/routing/coord-aprendida/route';
import { NextRequest } from 'next/server';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/coord-aprendida', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const BODY = {
  empresa_id: 'emp-1',
  endereco: { logradouro: 'Rua Piatã', numero: '104', cidade: 'Contagem', uf: 'MG' },
  lat: -19.861,
  lng: -44.029,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.chave.mockReturnValue('piata|104|contagem|MG'); // chave valida por default
  mocks.gravar.mockResolvedValue(undefined);
});

describe('POST /api/routing/coord-aprendida', () => {
  it('200 ok e grava a coord', async () => {
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mocks.gravar).toHaveBeenCalledWith('emp-1', BODY.endereco, -19.861, -44.029);
  });

  it('400 json invalido', async () => {
    const res = await POST(makeReq('{ quebrado'));
    expect(res.status).toBe(400);
  });

  it('400 quando faltam campos obrigatorios', async () => {
    const res = await POST(makeReq({ empresa_id: 'emp-1' }));
    expect(res.status).toBe(400);
    expect(mocks.gravar).not.toHaveBeenCalled();
  });

  it('400 quando lat/lng nao sao numeros finitos', async () => {
    const res = await POST(makeReq({ ...BODY, lat: Infinity }));
    expect(res.status).toBe(400);
  });

  it('200 mas nao grava quando endereco e incompleto (chave null)', async () => {
    mocks.chave.mockReturnValue(null);
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(mocks.gravar).not.toHaveBeenCalled();
  });

  it('500 quando gravar lanca', async () => {
    mocks.gravar.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq(BODY));
    expect(res.status).toBe(500);
  });
});

/**
 * Testes da API route PATCH /api/routing/rota/[id]/paradas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { PATCH } from '@/app/api/routing/rota/[id]/paradas/route';
import { NextRequest } from 'next/server';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/rota/r1/paradas', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function setupUpdateOk() {
  const updateMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  }));
  supabaseFromMock.mockReturnValue({ update: updateMock });
  return updateMock;
}

function setupUpdateError(message = 'boom') {
  const updateMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: null, error: { code: 'XX', message } })),
    })),
  }));
  supabaseFromMock.mockReturnValue({ update: updateMock });
  return updateMock;
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

describe('PATCH /api/routing/rota/[id]/paradas', () => {
  it('200 com atualizadas=N em sucesso', async () => {
    setupUpdateOk();

    const res = await PATCH(
      makeReq({
        paradas: [
          { id: 'p1', ordem: 2, fixada: false },
          { id: 'p2', ordem: 1, fixada: true },
        ],
      }),
      makeParams('r1')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.atualizadas).toBe(2);
  });

  it('400 json invalido', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/routing/rota/r1/paradas', {
        method: 'PATCH',
        body: '{ nao json',
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams('r1')
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('json_invalido');
  });

  it('400 quando paradas nao e array', async () => {
    setupUpdateOk();
    const res = await PATCH(makeReq({ paradas: 'string' }), makeParams('r1'));
    expect(res.status).toBe(400);
  });

  it('400 quando paradas vazias', async () => {
    setupUpdateOk();
    const res = await PATCH(makeReq({ paradas: [] }), makeParams('r1'));
    expect(res.status).toBe(400);
  });

  it('400 quando uma parada nao tem id', async () => {
    setupUpdateOk();
    const res = await PATCH(makeReq({ paradas: [{ ordem: 1 }] }), makeParams('r1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('parada_sem_id');
  });

  it('aceita parada so com observacao (sem ordem)', async () => {
    setupUpdateOk();

    const res = await PATCH(
      makeReq({ paradas: [{ id: 'p1', observacao: 'porta lateral' }] }),
      makeParams('r1')
    );

    expect(res.status).toBe(200);
  });

  it('500 quando TODAS as paradas falham', async () => {
    setupUpdateError('db down');

    const res = await PATCH(
      makeReq({ paradas: [{ id: 'p1', ordem: 1 }] }),
      makeParams('r1')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

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

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

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

/**
 * Setup do mock supabase pra cobrir:
 * - SELECT (fetch all paradas no inicio do PATCH)
 * - UPDATE (pass 1 + pass 2 + pass 3) — todos com .select('id') no fim
 */
function setupSupabase(opts: {
  dbParadas?: Array<{ id: string; ordem: number }>;
  updateResult?: { data: unknown; error: unknown };
}) {
  const { dbParadas = [], updateResult = { data: [{ id: 'matched' }], error: null } } = opts;

  const updateMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve(updateResult)),
      })),
    })),
  }));

  const selectMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({ data: dbParadas, error: null })),
    })),
  }));

  supabaseFromMock.mockReturnValue({
    update: updateMock,
    select: selectMock,
  });

  return { updateMock, selectMock };
}

function setupUpdateOk() {
  // Default: 2 paradas no DB pra cobrir cenarios de reorder
  return setupSupabase({
    dbParadas: [
      { id: 'p1', ordem: 1 },
      { id: 'p2', ordem: 2 },
    ],
  }).updateMock;
}

function setupUpdateError(message = 'boom') {
  return setupSupabase({
    dbParadas: [{ id: 'p1', ordem: 1 }],
    updateResult: { data: null, error: { code: 'XX', message } },
  }).updateMock;
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

  it('persiste concluida_em (motorista confirmou entrega)', async () => {
    const updateMock = setupUpdateOk();

    const res = await PATCH(
      makeReq({
        paradas: [{ id: 'p1', concluida_em: '2026-05-29T20:00:00Z' }],
      }),
      makeParams('r1')
    );

    expect(res.status).toBe(200);
    // O .update() recebeu concluida_em entre os campos
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ concluida_em: '2026-05-29T20:00:00Z' })
    );
  });

  it('aceita concluida_em=null pra desmarcar entrega (motorista errou)', async () => {
    const updateMock = setupUpdateOk();

    const res = await PATCH(
      makeReq({ paradas: [{ id: 'p1', concluida_em: null }] }),
      makeParams('r1')
    );

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ concluida_em: null })
    );
  });

  it('500 quando DB error no pass 1 (reordenacao)', async () => {
    setupUpdateError('db down');

    const res = await PATCH(
      makeReq({ paradas: [{ id: 'p1', ordem: 1 }] }),
      makeParams('r1')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    // Novo formato: aborta no pass 1 com erro estruturado em vez de
    // passar adiante e contar como "todas falharam"
    expect(body.error).toBe('pass1_falhou');
    expect(body.detail).toBe('db down');
  });

  it('500 quando pass 1 (temp shift) retorna 0 rows (RLS bloqueando)', async () => {
    // Sem ordem no request — vai direto pra pass 2 sem temp shift.
    // Pass 2 retorna 0 rows → erro nenhuma_linha_atualizada.
    setupSupabase({
      dbParadas: [{ id: 'p1', ordem: 1 }],
      updateResult: { data: [], error: null },
    });

    const res = await PATCH(
      makeReq({ paradas: [{ id: 'p1', observacao: 'teste' }] }),
      makeParams('r1')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.erros[0].message).toMatch(/nenhuma_linha_atualizada/);
  });

  it('500 quando pass 1 (reorder) falha silenciosamente — proteje contra bug do duplicate key', async () => {
    // Pass 1 com 0 rows agora ABORTA antes de pass 2 — sem isso, pass 2
    // tentava aplicar positivos em cima das paradas que nao moveram, e
    // pegava duplicate key (bug que o motorista reportou).
    setupSupabase({
      dbParadas: [
        { id: 'p1', ordem: 1 },
        { id: 'p2', ordem: 2 },
      ],
      updateResult: { data: [], error: null }, // pass 1 ja retorna 0
    });

    const res = await PATCH(
      makeReq({
        paradas: [
          { id: 'p1', ordem: 2 },
          { id: 'p2', ordem: 1 },
        ],
      }),
      makeParams('r1')
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('pass1_silencioso');
  });
});

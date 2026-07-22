/**
 * Prova que o guard requireSessao está LIGADO nas rotas de API:
 * sem sessão no cookie, a rota devolve 401 antes de tocar no banco.
 * (Os demais testes de rota mockam o guard como "logado" — este aqui
 * usa o guard REAL com o supabase server mockado sem usuário.)
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

import { GET } from '@/app/api/routing/rota/[id]/route';

describe('GET /api/routing/rota/[id] sem sessão', () => {
  it('devolve 401 nao_autenticado sem consultar o banco', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/routing/rota/abc'),
      { params: Promise.resolve({ id: 'abc' }) }
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'nao_autenticado' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

import { requireSessao } from '@/lib/auth/requireSessao';

beforeEach(() => {
  getUserMock.mockReset();
});

describe('requireSessao', () => {
  it('com sessão: devolve user e erro null', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const r = await requireSessao();

    expect(r.erro).toBeNull();
    expect(r.user?.id).toBe('u1');
  });

  it('sem sessão: devolve 401 com corpo nao_autenticado', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const r = await requireSessao();

    expect(r.user).toBeNull();
    expect(r.erro).not.toBeNull();
    expect(r.erro!.status).toBe(401);
    expect(await r.erro!.json()).toEqual({ error: 'nao_autenticado' });
  });
});

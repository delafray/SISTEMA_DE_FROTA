/**
 * Teste do caminho OFFLINE da /motorista: sem internet, mantem o motorista
 * logado pelo cache local (authOffline) e mostra o banner + a Rota do dia.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

const mockRouterPush = vi.fn();
// Guard e logout usam replace (11/06: chute pro login não pode entrar no
// histórico, senão o botão voltar do celular cai no login pra sempre).
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }) }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: vi.fn(), signOut: vi.fn() }, from: vi.fn() })),
}));

const obterSessaoComFallback = vi.fn();
vi.mock('@/lib/offline/authOffline', () => ({
  obterSessaoComFallback: (...a: unknown[]) => obterSessaoComFallback(...a),
  ROLES_OPERACAO: ['motorista', 'admin', 'gestor'],
}));
vi.mock('@/lib/offline/sessao', () => ({ limparSessaoLocal: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/offline/rotaCache', () => ({
  limparRotasAtivas: vi.fn().mockResolvedValue(undefined),
  listarRotasCacheadas: vi.fn().mockResolvedValue([]),
}));

import MotoristaPage from '@/app/(motorista)/motorista/page';
import { limparSessaoLocal } from '@/lib/offline/sessao';
import { limparRotasAtivas } from '@/lib/offline/rotaCache';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Motorista page — offline', () => {
  it('mantem logado via cache, mostra banner offline e a Rota do dia com os IDs', async () => {
    obterSessaoComFallback.mockResolvedValue({
      ok: true,
      origem: 'offline_cache',
      sessao: { usuario_id: 'u', empresa_id: 'emp-77', motorista_id: 'mot-88', role: 'motorista', nome: 'Carlos' },
    });

    render(<MotoristaPage />);

    await waitFor(() => expect(screen.getByTestId('banner-offline')).toBeInTheDocument());

    const link = screen.getByTestId('btn-rota-do-dia') as HTMLAnchorElement;
    expect(link.href).toContain('motorista_id=mot-88');
    expect(link.href).toContain('empresa_id=emp-77');
    expect(mockRouterPush).not.toHaveBeenCalled(); // nao expulsou pro login
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('sem sessao (online, sem cache) → manda pro login com replace (sem poluir o historico)', async () => {
    obterSessaoComFallback.mockResolvedValue({ ok: false, origem: 'online', motivo: 'sem_sessao' });
    render(<MotoristaPage />);
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
  });

  it('logout (Sair) corta a sessao local mas PRESERVA as rotas em cache', async () => {
    obterSessaoComFallback.mockResolvedValue({
      ok: true,
      origem: 'offline_cache',
      sessao: { usuario_id: 'u', empresa_id: 'emp-1', motorista_id: 'mot-1', role: 'motorista', nome: 'Carlos' },
    });

    render(<MotoristaPage />);
    const sair = await waitFor(() => screen.getByText('Sair'));
    fireEvent.click(sair);

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
    expect(limparSessaoLocal).toHaveBeenCalled();
    // Decisao do dono: nao apagar rotas ao sair (motorista nao perde acesso offline
    // se tocar Sair sem querer).
    expect(limparRotasAtivas).not.toHaveBeenCalled();
  });
});

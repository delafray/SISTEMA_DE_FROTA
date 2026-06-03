/**
 * Teste do caminho OFFLINE da /motorista: sem internet, mantem o motorista
 * logado pelo cache local (authOffline) e mostra o banner + a Rota do dia.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

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
  });

  it('sem sessao (online, sem cache) → manda pro login', async () => {
    obterSessaoComFallback.mockResolvedValue({ ok: false, origem: 'online', motivo: 'sem_sessao' });
    render(<MotoristaPage />);
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'));
  });
});

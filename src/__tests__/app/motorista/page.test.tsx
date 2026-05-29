/**
 * Testes da página /motorista — foco no botão "Rota do dia".
 *
 * Verifica:
 *  - Botão aparece com link correto quando motorista tem vínculo
 *  - Fallback desabilitado quando sem vínculo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── ENV ────────────────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// ─── MOCKS ──────────────────────────────────────────────────────────

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock do Supabase client — padrão Builder fluente
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockEq    = vi.fn(() => ({ eq: mockEq2, single: mockSingle }));
const mockEq2   = vi.fn(() => ({ single: mockSingle }));
const mockFrom  = vi.fn(() => ({ select: mockSelect }));

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, signOut: vi.fn() },
    from: mockFrom,
  })),
}));

// ─── IMPORT após mocks ───────────────────────────────────────────────
import MotoristaPage from '@/app/(motorista)/motorista/page';

// ─── HELPERS ────────────────────────────────────────────────────────

/** Configura Supabase pra retornar usuário + perfil com motorista_id */
function setupSupabaseComVinculo(motoristaId = 'mot-uuid-1', empresaId = 'emp-uuid-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  // perfil → nome + motorista_id
  // usuario_empresas → empresa_id + role
  // pedidos, adiantamentos, abastecimentos → listas vazias
  mockSingle
    .mockResolvedValueOnce({ data: { nome: 'João', motorista_id: motoristaId } })   // perfil
    .mockResolvedValueOnce({ data: { empresa_id: empresaId, role: 'motorista' } });  // usuario_empresas

  // Promise.all com 3 queries retornando listas vazias
  const mockPromiseResolvers = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockOrder = vi.fn(() => ({ limit: mockPromiseResolvers }));
  mockSelect.mockReturnValue({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle, order: mockOrder })), single: mockSingle, order: mockOrder })) });
}

/** Configura Supabase sem motorista_id (sem vínculo) */
function setupSupabaseSemVinculo(empresaId = 'emp-uuid-1') {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  mockSingle
    .mockResolvedValueOnce({ data: { nome: 'Maria', motorista_id: null } })
    .mockResolvedValueOnce({ data: { empresa_id: empresaId, role: 'motorista' } });
}

// ─── TESTES ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Motorista page — Rota do dia', () => {
  it('exibe link com motorista_id e empresa_id corretos quando há vínculo', async () => {
    setupSupabaseComVinculo('mot-111', 'emp-222');

    render(<MotoristaPage />);

    const link = await waitFor(() =>
      screen.getByTestId('btn-rota-do-dia')
    );

    expect(link.tagName).toBe('A');
    expect((link as HTMLAnchorElement).href).toContain('motorista_id=mot-111');
    expect((link as HTMLAnchorElement).href).toContain('empresa_id=emp-222');
    expect((link as HTMLAnchorElement).href).toContain('/mobile/rota');
  });

  it('exibe texto "Rota do dia" no botão', async () => {
    setupSupabaseComVinculo('mot-111', 'emp-222');

    render(<MotoristaPage />);

    await waitFor(() => screen.getByTestId('btn-rota-do-dia'));

    expect(screen.getByText('Rota do dia')).toBeTruthy();
    expect(screen.getByText(/Ver rota ativa ou criar nova/)).toBeTruthy();
  });

  it('exibe fallback desabilitado sem link quando sem vínculo de motorista', async () => {
    setupSupabaseSemVinculo('emp-333');

    render(<MotoristaPage />);

    // Espera o loading terminar (texto "Rota do dia" aparece, mas sem <a>)
    await waitFor(() => screen.getByText('Rota do dia'));

    // Não deve existir link com data-testid
    expect(screen.queryByTestId('btn-rota-do-dia')).toBeNull();
    // Ao menos um elemento menciona "solicite ao gestor" (aviso ou fallback do card)
    expect(screen.getAllByText(/solicite ao gestor/i).length).toBeGreaterThan(0);
  });
});

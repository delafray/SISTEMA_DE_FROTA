/**
 * Testes do auth com fallback offline.
 * Mocka o cliente Supabase e usa fake-indexeddb pra sessao local.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  obterSessaoComFallback,
  ehErroDeRede,
} from '@/lib/offline/authOffline';
import { salvarSessaoLocal, lerSessaoLocal } from '@/lib/offline/sessao';
import { getDB } from '@/lib/offline/fila';

// ─── fake supabase ───────────────────────────────────────────────────
interface FakeCfg {
  getUser: () => Promise<{ data: { user: { id: string } | null }; error?: unknown }>;
  perfil?: { nome: string | null; motorista_id: string | null } | null;
  ue?: { empresa_id: string; role: string } | null;
}

function fakeSupabase(cfg: FakeCfg): SupabaseClient {
  const perfilChain = {
    select: () => ({ eq: () => ({ single: async () => ({ data: cfg.perfil ?? null }) }) }),
  };
  const ueChain = {
    select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: cfg.ue ?? null }) }) }) }),
  };
  return {
    auth: { getUser: cfg.getUser },
    from: (table: string) => (table === 'perfis' ? perfilChain : ueChain),
  } as unknown as SupabaseClient;
}

beforeEach(async () => {
  await getDB().sessao_local.clear();
  // Default: navegador "online". Cada teste que precisa, sobrescreve via stubGlobal.
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('obterSessaoComFallback — navegador OFFLINE (navigator.onLine=false)', () => {
  it('atalho determinístico: nem chama getUser, entra direto pelo cache', async () => {
    await salvarSessaoLocal({ usuario_id: 'cache-on', empresa_id: 'e', motorista_id: 'm', role: 'motorista', nome: 'Ana' });
    vi.stubGlobal('navigator', { onLine: false });

    let getUserChamado = false;
    const supabase = fakeSupabase({
      getUser: async () => { getUserChamado = true; return { data: { user: { id: 'x' } } }; },
    });

    const r = await obterSessaoComFallback(supabase);

    expect(getUserChamado).toBe(false); // nao tentou a rede
    expect(r.ok).toBe(true);
    expect(r.origem).toBe('offline_cache');
    expect(r.sessao?.usuario_id).toBe('cache-on');
  });

  it('navegador offline e SEM cache → offline_sem_cache (nao tenta rede)', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const supabase = fakeSupabase({ getUser: async () => ({ data: { user: { id: 'x' } } }) });

    const r = await obterSessaoComFallback(supabase);

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('offline_sem_cache');
  });
});

describe('ehErroDeRede', () => {
  it('true pra AuthRetryableFetchError do supabase', () => {
    expect(ehErroDeRede({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
  });
  it('true pra "Failed to fetch" / network / status 0', () => {
    expect(ehErroDeRede({ message: 'Failed to fetch' })).toBe(true);
    expect(ehErroDeRede({ message: 'NetworkError when attempting' })).toBe(true);
    expect(ehErroDeRede({ status: 0 })).toBe(true);
    expect(ehErroDeRede(new Error('Load failed'))).toBe(true);
  });
  it('false pra erro de auth real e null', () => {
    expect(ehErroDeRede({ name: 'AuthApiError', message: 'invalid token' })).toBe(false);
    expect(ehErroDeRede(null)).toBe(false);
  });
});

describe('obterSessaoComFallback — ONLINE', () => {
  it('sucesso: devolve sessao e PERSISTE local pra uso offline', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: { id: 'user-9' } } }),
      perfil: { nome: 'João', motorista_id: 'mot-9' },
      ue: { empresa_id: 'emp-9', role: 'motorista' },
    });

    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(true);
    expect(r.origem).toBe('online');
    expect(r.sessao).toMatchObject({ usuario_id: 'user-9', empresa_id: 'emp-9', motorista_id: 'mot-9', role: 'motorista', nome: 'João' });

    // persistiu
    const local = await lerSessaoLocal();
    expect(local?.usuario_id).toBe('user-9');
  });

  it('sem usuario (logout real, sem erro de rede) → sem_sessao', async () => {
    const supabase = fakeSupabase({ getUser: async () => ({ data: { user: null } }) });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('sem_sessao');
  });

  it('sem vinculo de empresa → sem_empresa', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: { id: 'u' } } }),
      perfil: { nome: 'X', motorista_id: 'm' },
      ue: null,
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('sem_empresa');
  });

  it('role nao permitido → role_negado', async () => {
    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: { id: 'u' } } }),
      perfil: { nome: 'X', motorista_id: null },
      ue: { empresa_id: 'e', role: 'financeiro' },
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('role_negado');
  });
});

describe('obterSessaoComFallback — OFFLINE', () => {
  it('erro de rede no getUser + cache valido → entra offline', async () => {
    await salvarSessaoLocal({ usuario_id: 'cache-u', empresa_id: 'cache-e', motorista_id: 'cache-m', role: 'motorista', nome: 'Maria' });

    const supabase = fakeSupabase({
      getUser: async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'offline' } }),
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(true);
    expect(r.origem).toBe('offline_cache');
    expect(r.sessao?.usuario_id).toBe('cache-u');
  });

  it('getUser LANÇA (fetch rejeitou) + cache valido → entra offline', async () => {
    await salvarSessaoLocal({ usuario_id: 'cache-u2', empresa_id: 'e', motorista_id: 'm', role: 'admin', nome: null });

    const supabase = fakeSupabase({
      getUser: async () => { throw new Error('Failed to fetch'); },
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(true);
    expect(r.origem).toBe('offline_cache');
    expect(r.sessao?.usuario_id).toBe('cache-u2');
  });

  it('offline SEM cache → offline_sem_cache', async () => {
    const supabase = fakeSupabase({
      getUser: async () => { throw new Error('Failed to fetch'); },
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('offline_sem_cache');
  });

  it('cache com role nao permitido → role_negado', async () => {
    await salvarSessaoLocal({ usuario_id: 'u', empresa_id: 'e', motorista_id: null, role: 'financeiro', nome: null });
    const supabase = fakeSupabase({
      getUser: async () => { throw new Error('Failed to fetch'); },
    });
    const r = await obterSessaoComFallback(supabase);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('role_negado');
  });
});

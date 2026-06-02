/**
 * Autenticacao com fallback OFFLINE.
 *
 * Online: valida no Supabase (getUser + perfil + vinculo de empresa) e persiste
 * o perfil no IndexedDB pra uso futuro offline.
 * Offline (erro de rede): le a sessao local (valida por 7 dias). Sem cache, falha
 * e a pagina manda pro /login.
 *
 * IMPORTANTE distinguir os dois casos de "sem usuario":
 * - getUser devolve erro de REDE  → motorista pode estar offline → tenta cache.
 * - getUser devolve usuario null SEM erro de rede → logout real → vai pro login.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { salvarSessaoLocal, lerSessaoLocal } from './sessao';

export interface PerfilSessao {
  usuario_id: string;
  empresa_id: string;
  motorista_id: string | null;
  role: string;
  nome: string | null;
}

export interface ResultadoAuth {
  ok: boolean;
  origem: 'online' | 'offline_cache';
  sessao?: PerfilSessao;
  motivo?: 'sem_sessao' | 'sem_empresa' | 'role_negado' | 'offline_sem_cache';
}

/** Papeis que operam o app mobile/painel do motorista. */
export const ROLES_OPERACAO = ['motorista', 'admin', 'gestor'];

/**
 * Heuristica: o erro veio de FALHA DE REDE (→ fallback offline) e nao de auth
 * real (token invalido, sessao revogada → login)? PURA, testavel.
 */
export function ehErroDeRede(e: unknown): boolean {
  if (!e) return false;
  const obj = e as { name?: string; message?: string; status?: number };
  const name = (obj.name ?? '').toLowerCase();
  const msg = (obj.message ?? '').toLowerCase();
  if (name.includes('authretryablefetcherror')) return true; // supabase-js offline
  if (obj.status === 0) return true;
  return (
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') // Safari
  );
}

function navegadorOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

async function resolverOffline(roles: string[]): Promise<ResultadoAuth> {
  const local = await lerSessaoLocal();
  if (!local) return { ok: false, origem: 'offline_cache', motivo: 'offline_sem_cache' };
  if (!roles.includes(local.role)) return { ok: false, origem: 'offline_cache', motivo: 'role_negado' };
  return {
    ok: true,
    origem: 'offline_cache',
    sessao: {
      usuario_id: local.usuario_id,
      empresa_id: local.empresa_id,
      motorista_id: local.motorista_id,
      role: local.role,
      nome: local.nome,
    },
  };
}

/**
 * Resolve a sessao do usuario com fallback offline e persiste o perfil quando online.
 * @param supabase cliente browser do Supabase
 * @param roles papeis permitidos (default: motorista/admin/gestor)
 */
export async function obterSessaoComFallback(
  supabase: SupabaseClient,
  roles: string[] = ROLES_OPERACAO
): Promise<ResultadoAuth> {
  try {
    const { data: auth, error } = await supabase.auth.getUser();

    if (error) {
      if (ehErroDeRede(error)) return resolverOffline(roles);
      return { ok: false, origem: 'online', motivo: 'sem_sessao' };
    }
    if (!auth?.user) return { ok: false, origem: 'online', motivo: 'sem_sessao' };

    const { data: perfil } = await supabase
      .from('perfis')
      .select('nome,motorista_id')
      .eq('id', auth.user.id)
      .single();

    const { data: ue } = await supabase
      .from('usuario_empresas')
      .select('empresa_id,role')
      .eq('usuario_id', auth.user.id)
      .eq('is_padrao', true)
      .single();

    if (!ue?.empresa_id) return { ok: false, origem: 'online', motivo: 'sem_empresa' };
    if (!roles.includes(ue.role)) return { ok: false, origem: 'online', motivo: 'role_negado' };

    const sessao: PerfilSessao = {
      usuario_id: auth.user.id,
      empresa_id: ue.empresa_id as string,
      motorista_id: (perfil?.motorista_id as string | null) ?? null,
      role: ue.role as string,
      nome: (perfil?.nome as string | null) ?? null,
    };

    // Persiste pra uso offline (no-op em ambiente sem IndexedDB).
    await salvarSessaoLocal(sessao);
    return { ok: true, origem: 'online', sessao };
  } catch (e) {
    // Excecao (fetch rejeitou offline, ou navegador offline) → tenta o cache local.
    if (ehErroDeRede(e) || !navegadorOnline()) return resolverOffline(roles);
    // Erro inesperado nao-rede: ainda assim degrada pro cache (melhor que travar).
    return resolverOffline(roles);
  }
}

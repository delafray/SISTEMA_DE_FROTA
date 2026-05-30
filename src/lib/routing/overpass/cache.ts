/**
 * Cache de validacao de enderecos no Supabase.
 *
 * Estrategia de TTL (conforme pesquisa dos agentes):
 *  - resultado positivo (alta/media confianca): 30 dias
 *  - resultado fraco (baixa): 14 dias (cobertura OSM pode melhorar)
 *  - sem_dados: 6 meses (raramente mudara)
 *
 * Chave: (rua_norm, cidade, uf) — normalizada pra match consistente entre
 * variantes de digitacao da rua.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { normalizarRua } from './normalizar';
import type { DadosRua } from './types';

const log = createLogger('overpass-cache');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const DIAS_MS = 24 * 60 * 60 * 1000;

function ttlMsParaConfianca(confianca: DadosRua['confianca']): number {
  if (confianca === 'sem_dados') return 180 * DIAS_MS; // 6 meses
  if (confianca === 'baixa') return 14 * DIAS_MS;
  return 30 * DIAS_MS; // alta + media
}

export interface CacheEntry {
  dados: DadosRua;
}

/** Le cache. Retorna null se nao existe ou ja expirou. */
export async function lerCache(
  rua: string,
  cidade: string,
  uf: string
): Promise<CacheEntry | null> {
  const ruaNorm = normalizarRua(rua);
  if (!ruaNorm || !cidade || !uf) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('endereco_validacao_cache')
    .select('dados, expires_at')
    .eq('rua_norm', ruaNorm)
    .eq('cidade', cidade.trim())
    .eq('uf', uf.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    log.warn('cache_read_erro', { rua: ruaNorm, cidade, uf, message: error.message });
    return null;
  }
  if (!data) return null;

  // Expirado? Deixamos limpar no proximo write, nao deletamos aqui (race).
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return null;
  }

  return { dados: data.dados as DadosRua };
}

/** Grava no cache (upsert) com TTL baseado na confianca. */
export async function gravarCache(
  rua: string,
  cidade: string,
  uf: string,
  dados: DadosRua
): Promise<void> {
  const ruaNorm = normalizarRua(rua);
  if (!ruaNorm || !cidade || !uf) return;

  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + ttlMsParaConfianca(dados.confianca));

  const { error } = await supabase
    .from('endereco_validacao_cache')
    .upsert(
      {
        rua_norm: ruaNorm,
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        dados,
        confianca: dados.confianca,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'rua_norm,cidade,uf' }
    );

  if (error) {
    log.warn('cache_write_erro', { rua: ruaNorm, cidade, uf, message: error.message });
  }
}

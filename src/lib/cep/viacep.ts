/**
 * Cliente ViaCEP — consulta endereco a partir do CEP, com cache no Supabase.
 *
 * Estrategia:
 * 1. Tenta cache local (tabela `cep_cache` no Supabase).
 * 2. Se cache miss, consulta a API publica do ViaCEP.
 * 3. Salva resultado no cache (CEPs nao mudam quase nunca, TTL longo).
 *
 * SERVER-ONLY: usa SUPABASE_SERVICE_ROLE_KEY. Nao chamar do browser direto —
 * o componente InputEnderecoNF (Fase 1, passo 1.3) vai chamar via API route
 * (Fase 1, passo a definir) que envolve esta funcao.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 1.5 (ViaCEP) + 0.5 (tipos).
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import type { EnderecoCEP, ResultadoCEP } from './types';

// Re-export pra nao quebrar imports existentes que pegavam de viacep.ts
export type { ResultadoCEP } from './types';

const log = createLogger('viacep');

const VIACEP_URL_BASE = (process.env.VIACEP_URL ?? 'https://viacep.com.br/ws').replace(/\/$/, '');
const TIMEOUT_MS = 5000;

// ─── TIPOS INTERNOS ─────────────────────────────────────────────────

interface ViaCEPResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

// ─── HELPERS PUBLICOS ───────────────────────────────────────────────

/** Remove tudo que nao for digito. Use SEMPRE antes de validar/consultar. */
export function normalizarCEP(cep: string): string {
  return cep.replace(/\D/g, '');
}

/** True se o CEP tem exatamente 8 digitos (use depois de normalizar). */
export function validarFormatoCEP(cep: string): boolean {
  return /^[0-9]{8}$/.test(cep);
}

/** Formata pra exibicao (00000-000). Se invalido, devolve o input inalterado. */
export function formatarCEP(cep: string): string {
  const limpo = normalizarCEP(cep);
  if (limpo.length !== 8) return cep;
  return `${limpo.slice(0, 5)}-${limpo.slice(5)}`;
}

// ─── FUNCAO PRINCIPAL ───────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Consulta endereco a partir do CEP. Validacao + cache + API + cache write.
 * Sempre devolve resultado tipado — nunca lanca excecao.
 */
export async function consultarCEP(cepInput: string): Promise<ResultadoCEP> {
  const cep = normalizarCEP(cepInput);
  if (!validarFormatoCEP(cep)) {
    return { ok: false, motivo: 'cep_invalido' };
  }

  const supabase = getSupabase();

  // 1. Cache
  const { data: cached, error: errCache } = await supabase
    .from('cep_cache')
    .select('logradouro, bairro, cidade, uf')
    .eq('cep', cep)
    .maybeSingle();

  if (errCache) {
    // Falha de leitura no cache nao bloqueia — segue pro ViaCEP.
    log.warn('cache_query_failed', { cep, code: errCache.code, message: errCache.message });
  }

  if (cached) {
    log.info('cache_hit', { cep });
    return {
      ok: true,
      cep,
      endereco: {
        logradouro: (cached.logradouro as string | null) ?? '',
        bairro: (cached.bairro as string | null) ?? '',
        cidade: cached.cidade as string,
        uf: cached.uf as string,
      },
      fonte: 'cache',
    };
  }

  // 2. ViaCEP API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${VIACEP_URL_BASE}/${cep}/json/`, { signal: controller.signal });
    if (!res.ok) {
      log.warn('viacep_http_error', { cep, status: res.status });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as ViaCEPResponse;
    if (data.erro === true || !data.localidade || !data.uf) {
      log.info('cep_nao_encontrado', { cep });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    const endereco: EnderecoCEP = {
      logradouro: data.logradouro ?? '',
      bairro: data.bairro ?? '',
      cidade: data.localidade,
      uf: data.uf,
    };

    // 3. Salvar no cache (upsert pra suportar refresh futuro)
    const { error: errSave } = await supabase
      .from('cep_cache')
      .upsert({ cep, ...endereco }, { onConflict: 'cep' });

    if (errSave) {
      // Falha ao salvar nao bloqueia o retorno — o usuario ja tem o endereco.
      log.warn('cache_write_failed', { cep, code: errSave.code, message: errSave.message });
    }

    log.info('cep_api_hit', { cep, cidade: endereco.cidade });
    return { ok: true, cep, endereco, fonte: 'api' };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('viacep_timeout', { cep, timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('viacep_network_error', { cep, error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

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

// ─── BUSCA REVERSA: CEP REAL a partir do logradouro ─────────────────
// O `postcode` que o Nominatim devolve por rua e NAO-confiavel no BR (pega
// CEP especial/de grande usuario, tipo "...-909", ou CEP generico de faixa do
// municipio). A busca reversa do ViaCEP (UF/cidade/logradouro) e autoritativa:
// devolve os CEPs reais cadastrados naquela rua. So cravamos um CEP quando ha
// 1 unico (ou o bairro casa com 1); com varios, marcamos `cepMultiplos` e NAO
// chutamos. Nunca lanca excecao.

interface ViaCEPReverseItem {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

/** Normaliza nome de logradouro/bairro pra comparar: minusculo, sem acento,
 *  sem o TIPO no inicio (Rua/Avenida/...), espacos colapsados. Assim "Avenida
 *  Afonso Pena" (ViaCEP) casa com "Av Afonso Pena" / "Afonso Pena" (Nominatim/fala). */
function normalizarNomeLogradouro(s: string): string {
  const v = (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return v
    .replace(
      /^(avenida|av|rua|r|alameda|al|travessa|tv|rodovia|rod|estrada|estr|praca|pca|largo|via|viela|ladeira|passagem)\s+/,
      '',
    )
    .trim();
}

/**
 * Resolve o CEP real de uma rua via busca reversa do ViaCEP.
 * Retorna `{ cep }` quando ha 1 CEP unico (ou o bairro narrowou pra 1),
 * `{ cepMultiplos: true }` quando ha varios, ou ambos vazios quando a rua nao
 * foi encontrada / parametros insuficientes / erro de rede.
 */
export async function resolverCepDaRua(params: {
  uf: string;
  cidade: string;
  logradouro: string;
  bairro?: string;
}): Promise<{ cep?: string; cepMultiplos: boolean }> {
  const uf = (params.uf ?? '').trim();
  const cidade = (params.cidade ?? '').trim();
  const logradouro = (params.logradouro ?? '').trim();

  // ViaCEP exige UF (2 letras), cidade >= 3 e logradouro >= 3 chars.
  if (uf.length !== 2 || cidade.length < 3 || logradouro.length < 3) {
    return { cep: undefined, cepMultiplos: false };
  }

  const url = `${VIACEP_URL_BASE}/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(logradouro)}/json/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      log.warn('viacep_reverse_http_error', { uf, cidade, status: res.status });
      return { cep: undefined, cepMultiplos: false };
    }

    const data = (await res.json()) as ViaCEPReverseItem[] | { erro?: boolean };
    if (!Array.isArray(data) || data.length === 0) {
      return { cep: undefined, cepMultiplos: false };
    }

    const alvoRua = normalizarNomeLogradouro(logradouro);
    // Filtra so as entradas cuja rua bate exatamente (ViaCEP faz LIKE — pode
    // trazer "Afonso Pena Junior" junto da "Afonso Pena").
    let candidatos = data.filter(
      (d) => d.cep && normalizarNomeLogradouro(d.logradouro ?? '') === alvoRua,
    );

    // Bairro informado e casa com algum → crava o CEP daquele bairro.
    if (params.bairro && params.bairro.trim().length >= 2) {
      const alvoBairro = normalizarNomeLogradouro(params.bairro);
      const doBairro = candidatos.filter(
        (d) => normalizarNomeLogradouro(d.bairro ?? '') === alvoBairro,
      );
      if (doBairro.length > 0) candidatos = doBairro;
    }

    const cepsDistintos = Array.from(
      new Set(
        candidatos
          .map((d) => normalizarCEP(d.cep ?? ''))
          .filter((c) => validarFormatoCEP(c)),
      ),
    );

    if (cepsDistintos.length === 1) {
      return { cep: cepsDistintos[0], cepMultiplos: false };
    }
    if (cepsDistintos.length > 1) {
      log.info('viacep_reverse_multiplos', { uf, cidade, logradouro, total: cepsDistintos.length });
      return { cep: undefined, cepMultiplos: true };
    }
    return { cep: undefined, cepMultiplos: false };
  } catch (err) {
    const error = err as Error;
    log.warn('viacep_reverse_error', { uf, cidade, error: error.message });
    return { cep: undefined, cepMultiplos: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cache de geocoding + cota mensal da Google Geocoding API.
 *
 * Regras (definidas com o dono em 2026-06-01):
 *   1. `lerGeocodeCache` é consultado ANTES de qualquer chamada à API — hit não
 *      gera custo.
 *   2. `consumirCota` incrementa o contador mensal de forma ATÔMICA (RPC) só se
 *      ainda houver folga (< limite, default 38000/mês). Estourou → o chamador
 *      cai no fallback grátis (ViaCEP + escolher).
 *   3. `gravarGeocodeCache` salva o resultado do Google pra próximas vezes.
 *
 * SERVER-ONLY: usa SUPABASE_SERVICE_ROLE_KEY.
 * Tabelas/RPC: db/migration_geocode_google.sql.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { geocodarGoogle, type ResultadoGoogle } from './googleGeocoding';

const log = createLogger('geocode_cache');

const LIMITE_MENSAL = Number(process.env.GEOCODE_LIMITE_MENSAL ?? '38000');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Normaliza a consulta pra chave de cache: minúsculo, sem acento, sem
 *  pontuação, espaços colapsados. "Av. Afonso Pena, 342 - BH" e
 *  "avenida afonso pena 342 bh" caem na mesma chave quando equivalentes. */
export function chaveGeocode(consulta: string): string {
  return (consulta ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Monta a query estruturada de um endereço ("Logradouro, Numero, Bairro,
 *  Cidade - UF, CEP"). Usada como chave de cache COMPARTILHADA entre a captura
 *  (geocodar) e o resolverCoordenada (otimizar) — assim a 2ª resolução do mesmo
 *  endereço dá cache hit e NÃO gasta uma 2ª chamada ao Google. */
export function montarQueryEstruturada(e: {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}): string {
  return [
    e.logradouro,
    e.numero,
    e.bairro,
    e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : (e.cidade ?? e.uf),
    e.cep,
  ]
    .map((s) => (s ?? '').toString().trim())
    .filter(Boolean)
    .join(', ');
}

/** Mês corrente no formato 'YYYY-MM' (para a chave do contador de cota). */
export function mesAtual(d: Date = new Date()): string {
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

/** Lê o cache de geocoding. Null em miss/chave inválida/erro (nunca lança). */
export async function lerGeocodeCache(consulta: string): Promise<ResultadoGoogle | null> {
  const chave = chaveGeocode(consulta);
  if (chave.length < 3) return null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('geocode_cache')
      .select('lat, lng, cep, logradouro, numero, bairro, cidade, uf, precisao, endereco_formatado')
      .eq('chave', chave)
      .maybeSingle();

    if (error) {
      log.warn('cache_read_failed', { code: error.code, message: error.message });
      return null;
    }
    if (!data) return null;

    return {
      lat: Number(data.lat),
      lng: Number(data.lng),
      cep: (data.cep as string | null) ?? undefined,
      logradouro: (data.logradouro as string | null) ?? undefined,
      numero: (data.numero as string | null) ?? undefined,
      bairro: (data.bairro as string | null) ?? undefined,
      cidade: (data.cidade as string | null) ?? undefined,
      uf: (data.uf as string | null) ?? undefined,
      precisao: (data.precisao as string | null) ?? undefined,
      endereco_formatado: (data.endereco_formatado as string | null) ?? '',
    };
  } catch (err) {
    log.warn('cache_read_exception', { error: (err as Error).message });
    return null;
  }
}

/** Grava (upsert) um resultado de geocoding no cache. Falha não bloqueia. */
export async function gravarGeocodeCache(consulta: string, r: ResultadoGoogle): Promise<void> {
  const chave = chaveGeocode(consulta);
  if (chave.length < 3) return;

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('geocode_cache').upsert(
      {
        chave,
        lat: r.lat,
        lng: r.lng,
        cep: r.cep ?? null,
        logradouro: r.logradouro ?? null,
        numero: r.numero ?? null,
        bairro: r.bairro ?? null,
        cidade: r.cidade ?? null,
        uf: r.uf ?? null,
        precisao: r.precisao ?? null,
        endereco_formatado: r.endereco_formatado ?? null,
        fonte: 'google',
      },
      { onConflict: 'chave' },
    );
    if (error) log.warn('cache_write_failed', { code: error.code, message: error.message });
  } catch (err) {
    log.warn('cache_write_exception', { error: (err as Error).message });
  }
}

/**
 * Consome 1 da cota mensal do Google de forma ATÔMICA (RPC).
 * Devolve `{ permitido, total }`. `permitido=false` → estourou o limite do mês,
 * o chamador deve usar o fallback grátis. Em erro de infra, devolve
 * `permitido:false` (degrada pro grátis — nunca arrisca estourar a fatura).
 */
export async function consumirCota(): Promise<{ permitido: boolean; total: number }> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('consumir_geocode_cota', {
      p_mes: mesAtual(),
      p_limite: LIMITE_MENSAL,
    });
    if (error) {
      log.warn('cota_rpc_failed', { code: error.code, message: error.message });
      return { permitido: false, total: LIMITE_MENSAL };
    }
    // RPC devolve uma linha (table) → array com 1 item.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.permitido !== 'boolean') {
      return { permitido: false, total: LIMITE_MENSAL };
    }
    return { permitido: row.permitido, total: Number(row.total ?? 0) };
  } catch (err) {
    log.warn('cota_exception', { error: (err as Error).message });
    return { permitido: false, total: LIMITE_MENSAL };
  }
}

/**
 * Resolve UMA consulta via Google COM cache + cota (orquestração reutilizável):
 *   cache → (se há chave e cota) Google → grava cache.
 * Devolve o melhor resultado + a fonte, ou null (cache miss + sem chave/sem
 * cota/Google sem resultado) — o chamador então usa o fluxo grátis.
 * Usado pelo resolverCoordenada (pino) e disponível pra outros fluxos.
 */
export async function resolverGoogleCacheado(
  consulta: string,
  bias?: { lat?: number; lng?: number },
): Promise<{ resultado: ResultadoGoogle; fonte: 'cache' | 'google' } | null> {
  const cached = await lerGeocodeCache(consulta);
  if (cached) return { resultado: cached, fonte: 'cache' };

  if (!process.env.GOOGLE_MAPS_API_KEY) return null;

  const cota = await consumirCota();
  if (!cota.permitido) return null;

  const g = await geocodarGoogle(consulta, bias);
  if (g.ok && g.resultados.length > 0) {
    await gravarGeocodeCache(consulta, g.resultados[0]);
    return { resultado: g.resultados[0], fonte: 'google' };
  }
  return null;
}

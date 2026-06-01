/**
 * Uso das APIs medido internamente + montagem das linhas pra página /uso-apis.
 *
 * Só 3 serviços têm número ao vivo no nosso banco:
 *  - Google Geocoding: geocode_uso (mês corrente) → % exata vs teto.
 *  - Gemini: turnos do bot HOJE (bot_metricas) → % vs limite diário (~250 RPD).
 *  - Deepgram: nº de áudios transcritos no mês (turnos gemini_audio) → contagem.
 * O resto não medimos — a página só linka pro console do provedor.
 *
 * SERVER-ONLY: usa SUPABASE_SERVICE_ROLE_KEY (bot_metricas/geocode_uso só
 * acessíveis pela service role).
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { lerUsoMes } from '@/lib/routing/geocodeCache';
import { CATALOGO_APIS, type ApiCatalogo } from './catalogoApis';

const log = createLogger('uso-apis');

/** Limite diário de requisições do Gemini no free tier (ajustável por env). */
const GEMINI_LIMITE_DIA = Number(process.env.GEMINI_LIMITE_DIA ?? '250');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface UsoMedido {
  googleGeocoding: { total: number; limite: number };
  geminiHoje: { total: number; limite: number };
  deepgramMes: { total: number };
}

/** Início do dia (UTC) em ISO. */
export function inicioDiaUTC(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString();
}

/** Início do mês (UTC) em ISO. */
export function inicioMesUTC(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

/**
 * Coleta os números medidos. Nunca lança — em erro devolve zeros (a página
 * ainda mostra o catálogo + links).
 */
export async function coletarUsoApis(agora: Date = new Date()): Promise<UsoMedido> {
  const google = await lerUsoMes(); // { mes, total, limite }

  let geminiHoje = 0;
  let deepgramMes = 0;
  try {
    const supabase = getSupabase();
    const [g, d] = await Promise.all([
      supabase
        .from('bot_metricas')
        .select('id', { count: 'exact', head: true })
        .in('modo', ['gemini_texto', 'gemini_audio'])
        .gte('created_at', inicioDiaUTC(agora)),
      supabase
        .from('bot_metricas')
        .select('id', { count: 'exact', head: true })
        .eq('modo', 'gemini_audio')
        .gte('created_at', inicioMesUTC(agora)),
    ]);
    geminiHoje = g.count ?? 0;
    deepgramMes = d.count ?? 0;
  } catch (err) {
    log.warn('uso_metricas_falhou', { error: (err as Error).message });
  }

  return {
    googleGeocoding: { total: google.total, limite: google.limite },
    geminiHoje: { total: geminiHoje, limite: GEMINI_LIMITE_DIA },
    deepgramMes: { total: deepgramMes },
  };
}

export type StatusUso = 'ok' | 'alerta' | 'critico' | 'neutro';

export interface LinhaUso extends ApiCatalogo {
  /** % usado quando medível; null pros serviços sem medição interna. */
  pct: number | null;
  /** Texto do uso atual (ex: "120 / 9.800 este mês") ou a própria cota. */
  usoLabel: string;
  status: StatusUso;
}

function statusPorPct(pct: number | null): StatusUso {
  if (pct === null) return 'neutro';
  if (pct >= 90) return 'critico';
  if (pct >= 70) return 'alerta';
  return 'ok';
}

/**
 * Mescla catálogo + uso medido, calcula % e ORDENA: quem tem % primeiro
 * (maior → menor), depois os sem medição na ordem do catálogo. Função pura.
 */
export function montarLinhasUso(catalogo: ApiCatalogo[], uso: UsoMedido): LinhaUso[] {
  const linhas: LinhaUso[] = catalogo.map((api) => {
    let pct: number | null = null;
    let usoLabel = api.cota;

    if (api.medicao === 'google_geocoding') {
      const { total, limite } = uso.googleGeocoding;
      pct = limite > 0 ? Math.min(100, Math.round((total / limite) * 100)) : null;
      usoLabel = `${total.toLocaleString('pt-BR')} / ${limite.toLocaleString('pt-BR')} este mês`;
    } else if (api.medicao === 'gemini') {
      const { total, limite } = uso.geminiHoje;
      pct = limite > 0 ? Math.min(100, Math.round((total / limite) * 100)) : null;
      usoLabel = `${total} / ${limite} hoje`;
    } else if (api.medicao === 'deepgram') {
      // Sem duração do áudio guardada → só contagem; o crédito real fica no console.
      usoLabel = `${uso.deepgramMes.total} áudios este mês`;
    }

    return { ...api, pct, usoLabel, status: statusPorPct(pct) };
  });

  // Ordena: com % primeiro (desc), depois os neutros mantendo a ordem original.
  return linhas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const pa = a.l.pct;
      const pb = b.l.pct;
      if (pa === null && pb === null) return a.i - b.i;
      if (pa === null) return 1;
      if (pb === null) return -1;
      if (pb !== pa) return pb - pa;
      return a.i - b.i;
    })
    .map(({ l }) => l);
}

/** Atalho usado pela página: coleta o uso e já devolve as linhas prontas. */
export async function carregarLinhasUso(agora: Date = new Date()): Promise<LinhaUso[]> {
  const uso = await coletarUsoApis(agora);
  return montarLinhasUso(CATALOGO_APIS, uso);
}

/**
 * Logger de metricas do bot WhatsApp.
 *
 * Grava 1 linha em bot_metricas por turno (texto/audio/fast_path).
 * Fire-and-forget — falha NUNCA bloqueia conversa.
 *
 * Dashboard sugerido (futuro): /admin/bot/metricas
 *  - tokens medios por dia
 *  - cache hit ratio (cached_tokens / tokens_in)
 *  - top tools chamadas
 *  - latencia p50/p95
 *  - custo estimado agregado
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot-metricas');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface Metrica {
  telefone: string;
  empresa_id?: string;
  modo: 'fast_path' | 'gemini_texto' | 'gemini_audio';
  fast_path_matcher?: string;
  modelo?: string;
  tokens_in?: number;
  tokens_out?: number;
  cached_tokens?: number;
  tools_chamadas?: string[];
  tool_rounds?: number;
  latency_ms: number;
  sucesso: boolean;
  erro?: string;
}

/**
 * Grava uma metrica. Fire-and-forget — nunca lanca.
 */
export async function registrarMetrica(m: Metrica): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('bot_metricas').insert({
      telefone: m.telefone,
      empresa_id: m.empresa_id ?? null,
      modo: m.modo,
      fast_path_matcher: m.fast_path_matcher ?? null,
      modelo: m.modelo ?? null,
      tokens_in: m.tokens_in ?? null,
      tokens_out: m.tokens_out ?? null,
      cached_tokens: m.cached_tokens ?? null,
      tools_chamadas: m.tools_chamadas ?? null,
      tool_rounds: m.tool_rounds ?? null,
      latency_ms: m.latency_ms,
      sucesso: m.sucesso,
      erro: m.erro ?? null,
    });
    if (error) {
      log.warn('metrica_write_falhou', { telefone: m.telefone, message: error.message });
    }
  } catch (err) {
    log.error('metrica_excecao', { telefone: m.telefone, message: (err as Error).message });
  }
}

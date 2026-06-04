/**
 * Guarda proativa de cota do Gemini (free tier) — Camada 1 da resiliência do bot.
 *
 * ANTES de chamar o Gemini, verifica se ainda há orçamento no MINUTO (RPM) e no
 * DIA (RPD), contando as chamadas já feitas em `bot_metricas` (modos gemini_*).
 * Se estourou, o router NÃO chama o Gemini — degrada pro menu determinístico
 * (Camada 3), que não usa IA paga. O `comRetry` em volta do sendMessage é a
 * Camada 2 (retenta em 429/5xx). Limites configuráveis por env.
 *
 * FAIL-OPEN: se a contagem falhar (DB indisponível), LIBERA a chamada — é melhor
 * tentar o Gemini (e deixar o 429/retry agir) do que travar o bot por um hiccup.
 *
 * SERVER-ONLY (service role). Não é atômico de propósito: errar por 1-2 chamadas
 * é inofensivo (o 429 + retry cobre o overshoot), e evita o custo de um lock/RPC.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('gemini-cota');

const MODOS_GEMINI = ['gemini_texto', 'gemini_audio'];

export type ResultadoCota = { ok: true } | { ok: false; motivo: 'rpm' | 'rpd' };

/** Lê os limites do ambiente a cada chamada (testável via stubEnv). */
function limites(): { rpm: number; rpd: number } {
  return {
    rpm: Number(process.env.GEMINI_RPM ?? '15'),
    rpd: Number(process.env.GEMINI_RPD ?? '250'),
  };
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Início do dia (UTC) em ISO — janela do limite diário (RPD). */
function inicioDiaUTC(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString();
}

/**
 * Verifica se há cota disponível pra mais uma chamada ao Gemini agora.
 * Checa o DIA primeiro (RPD) — esse é o teto que mais aperta no free tier.
 */
export async function cotaGeminiDisponivel(agora: Date = new Date()): Promise<ResultadoCota> {
  const { rpm, rpd } = limites();
  try {
    const supabase = getSupabase();
    const umMinutoAtras = new Date(agora.getTime() - 60_000).toISOString();
    const inicioDia = inicioDiaUTC(agora);

    const [dia, minuto] = await Promise.all([
      supabase
        .from('bot_metricas')
        .select('id', { count: 'exact', head: true })
        .in('modo', MODOS_GEMINI)
        .gte('created_at', inicioDia),
      supabase
        .from('bot_metricas')
        .select('id', { count: 'exact', head: true })
        .in('modo', MODOS_GEMINI)
        .gte('created_at', umMinutoAtras),
    ]);

    const usoDia = dia.count ?? 0;
    const usoMinuto = minuto.count ?? 0;

    if (usoDia >= rpd) {
      log.warn('cota_rpd_estourada', { usoDia, limite: rpd });
      return { ok: false, motivo: 'rpd' };
    }
    if (usoMinuto >= rpm) {
      log.warn('cota_rpm_estourada', { usoMinuto, limite: rpm });
      return { ok: false, motivo: 'rpm' };
    }
    return { ok: true };
  } catch (err) {
    log.warn('cota_check_falhou_fail_open', { error: (err as Error).message });
    return { ok: true }; // fail-open: não trava o bot por erro de contagem
  }
}

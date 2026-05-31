/**
 * Histórico de conversa do bot WhatsApp.
 *
 * Persiste no Supabase (`whatsapp_historico`). Cold starts da Vercel matam a
 * instância — sem persistência, motorista perde contexto a cada reinício
 * (B1 do BOT_FRAMEWORK.md).
 *
 * Estrategia:
 *  - Janela: últimas 8 mensagens (4 turnos user+model) por telefone
 *  - Reset automatico: > 30min sem mensagem → começa "fresca"
 *  - Reset manual: motorista digita /novo (tratado pelo fast-path)
 *  - TTL no banco: 30 dias (limpeza periódica)
 *
 * Fallback gracioso: se Supabase falhar (tabela não existe, RLS, network),
 * loga e devolve historico vazio — NUNCA bloqueia a conversa.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('historico-whatsapp');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type Role = 'user' | 'model';

export interface MensagemHistorico {
  role: Role;
  text: string;
}

const MAX_MENSAGENS = 8;                 // 4 turnos
const RESET_INATIVIDADE_MS = 30 * 60_000; // 30 min

/**
 * Le ultimas N mensagens do telefone, ordenadas ASC (mais antiga primeiro).
 * Se a ultima mensagem tem > 30min, devolve vazio (reset automatico).
 */
export async function lerHistorico(telefone: string): Promise<MensagemHistorico[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('whatsapp_historico')
      .select('role, texto, created_at')
      .eq('telefone', telefone)
      .order('created_at', { ascending: false })
      .limit(MAX_MENSAGENS);

    if (error) {
      log.warn('historico_read_falhou', { telefone, message: error.message });
      return [];
    }
    if (!data || data.length === 0) return [];

    // Reset automatico por inatividade
    const ultimaTs = new Date(data[0].created_at as string).getTime();
    if (Date.now() - ultimaTs > RESET_INATIVIDADE_MS) {
      log.info('historico_reset_inatividade', { telefone, inativo_min: Math.round((Date.now() - ultimaTs) / 60_000) });
      return [];
    }

    // Reverter pra ASC (mais antigo primeiro — formato esperado pelo Gemini)
    const ascendente: MensagemHistorico[] = data
      .reverse()
      .map((m) => ({
        role: m.role as Role,
        text: m.texto as string,
      }));

    // DEFESA: Gemini exige que historico comece com role 'user'.
    // Se a janela cortou um turno no meio (ou houve race na gravacao
    // user/model do turno anterior), descarta msgs 'model' do inicio.
    // Sem isso: "First content should be with role 'user', got model"
    // quebra TODA chamada subsequente do bot.
    let i = 0;
    while (i < ascendente.length && ascendente[i].role !== 'user') i++;
    if (i > 0) {
      log.warn('historico_descartou_model_lider', { telefone, descartadas: i });
    }
    return ascendente.slice(i);
  } catch (err) {
    log.error('historico_read_excecao', { telefone, message: (err as Error).message });
    return [];
  }
}

/**
 * Grava mensagem no historico. Fire-and-forget — falha NAO bloqueia conversa.
 */
export async function gravarMensagem(
  telefone: string,
  role: Role,
  texto: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!texto || !texto.trim()) return; // nada pra gravar
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('whatsapp_historico').insert({
      telefone,
      role,
      texto,
      metadata: metadata ?? null,
    });
    if (error) {
      log.warn('historico_write_falhou', { telefone, role, message: error.message });
    }
  } catch (err) {
    log.error('historico_write_excecao', { telefone, message: (err as Error).message });
  }
}

/**
 * Limpa todo o historico de um telefone. Usado quando motorista pede
 * "comecar de novo" / "/novo".
 */
export async function limparHistorico(telefone: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('whatsapp_historico')
      .delete()
      .eq('telefone', telefone);
    if (error) {
      log.warn('historico_limpar_falhou', { telefone, message: error.message });
    } else {
      log.info('historico_limpo', { telefone });
    }
  } catch (err) {
    log.error('historico_limpar_excecao', { telefone, message: (err as Error).message });
  }
}

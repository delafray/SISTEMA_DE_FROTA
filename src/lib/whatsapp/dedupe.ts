/**
 * Dedupe por wamid do caminho CLÁSSICO (R8 da auditoria).
 *
 * A Evolution reenvia a mesma mensagem até 10× quando o webhook demora a
 * responder (áudio longo → Deepgram+Gemini antes do ACK). Sem dedupe, um
 * reenvio pode registrar o mesmo abastecimento/lembrete DUAS vezes.
 *
 * Reusa a tabela `bot_msgs_processadas` (mesma do classificador, R4):
 * status 'processando' enquanto roda, 'ok' ao terminar. Se a função morrer
 * no meio, o registro fica 'processando' e a reentrega REPROCESSA depois da
 * janela (não perde mensagem).
 *
 * IMPORTANTE: este dedupe só é chamado com MODO_CLASSIFICADOR DESLIGADO
 * (ver webhook/route.ts). Ligado, o classificadorBot faz a própria reserva —
 * reservar 2× marcaria a mensagem como duplicada e ela seria DESCARTADA.
 * (Consolidar as duas implementações é item da auditoria.)
 *
 * FAIL-OPEN obrigatório: qualquer erro (tabela ausente, rede) → 'reservado',
 * ou seja, processa normalmente. Dedupe nunca derruba mensagem.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('whatsapp_dedupe');

// Reenvio da Evolution chega em segundos; 2min cobre com folga sem segurar
// reprocessamento legítimo (função morta) por muito tempo.
const JANELA_EM_CURSO_MS = 2 * 60 * 1000;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Reserva o wamid. 'duplicada' = já concluída ou em processamento recente. */
export async function reservarWamid(wamid: string): Promise<'reservado' | 'duplicada'> {
  if (!wamid) return 'reservado';
  try {
    const supa = getSupabase();
    const { error } = await supa
      .from('bot_msgs_processadas')
      .insert({ wamid, status: 'processando' });
    if (!error) return 'reservado';

    // Conflito (já existe): decide pelo status + idade.
    const { data } = await supa
      .from('bot_msgs_processadas')
      .select('status, processado_em')
      .eq('wamid', wamid)
      .maybeSingle();
    if (!data) return 'reservado'; // estado estranho → fail-open
    const recente =
      !!data.processado_em &&
      Date.now() - new Date(data.processado_em as string).getTime() < JANELA_EM_CURSO_MS;
    if (data.status === 'ok' || recente) return 'duplicada';

    // 'processando' antigo = função morreu no meio → assume e reprocessa.
    await supa
      .from('bot_msgs_processadas')
      .update({ processado_em: new Date().toISOString() })
      .eq('wamid', wamid);
    return 'reservado';
  } catch (err) {
    log.warn('dedupe_falhou_fail_open', { wamid, message: (err as Error).message });
    return 'reservado';
  }
}

/** Marca como concluída. Best-effort: falha só loga. */
export async function marcarWamidOk(wamid: string): Promise<void> {
  if (!wamid) return;
  try {
    await getSupabase()
      .from('bot_msgs_processadas')
      .update({ status: 'ok', processado_em: new Date().toISOString() })
      .eq('wamid', wamid);
  } catch (err) {
    log.warn('marcar_ok_falhou', { wamid, message: (err as Error).message });
  }
}

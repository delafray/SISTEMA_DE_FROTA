/**
 * Prints do Zap — arquiva TODA imagem recebida pelo bot (decisão do dono,
 * 10/06/2026): sobe pro R2 em `prints/<empresa>/<uuid>.jpg` e registra em
 * `prints_zap` (telefone, nome, legenda, URL).
 *
 * É só um SIDE-EFFECT: não muda nenhuma resposta do bot (ele continua
 * respondendo que não entende imagem). Serve de galeria pro dono mostrar
 * telas do celular ao Claude — que busca em GET /api/prints e baixa a imagem.
 *
 * Best-effort de ponta a ponta: qualquer falha aqui NUNCA derruba o router.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { persistirMidiaNoR2, chaveMidia } from '@/lib/storage/r2';
import { getMediaUrl, type ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { UserIdentity } from '@/lib/whatsapp/auth';

const log = createLogger('prints_zap');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Arquiva a imagem da mensagem no R2 + registra na galeria. Nunca lança. */
export async function arquivarPrintZap(msg: ParsedMessage, identity: UserIdentity): Promise<void> {
  try {
    if (msg.tipo !== 'foto' || !msg.mediaId) return;

    const mediaUrl = await getMediaUrl(msg.mediaId);
    if (!mediaUrl) {
      log.warn('print_sem_media_url', { from: msg.from });
      return;
    }

    const empresaId = 'empresa_id' in identity ? (identity.empresa_id ?? null) : null;
    const url = await persistirMidiaNoR2(mediaUrl, chaveMidia('prints', empresaId));
    if (!url) return;

    const nome = 'nome' in identity ? ((identity as { nome?: string | null }).nome ?? null) : null;
    const { error } = await getSupabase().from('prints_zap').insert({
      telefone: msg.from,
      nome,
      legenda: msg.texto?.trim() || null,
      url,
    });
    if (error) {
      // tabela pode não existir antes da migration_prints_zap — só loga
      log.warn('print_registro_falhou', { error: error.message, url });
      return;
    }
    log.info('print_arquivado', { from: msg.from, url });
  } catch (err) {
    log.warn('print_arquivar_erro', { error: (err as Error).message });
  }
}

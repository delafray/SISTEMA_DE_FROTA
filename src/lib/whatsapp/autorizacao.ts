/**
 * Autorização de telefone — a "trava" que vem da tabela `telefones` (tela /autorizacoes).
 * Antes de anotar, o bot verifica: o número está cadastrado? está Ativo? pode Anotar?
 * Casa o número que chega no zap (com/sem 9) contra o canônico salvo, via variações.
 */

import { createClient } from '@supabase/supabase-js';
import { variacoesTelefone } from '@/lib/utils/telefone';
import { createLogger } from '@/lib/logger';

const log = createLogger('autorizacao');

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type Autorizacao =
  | { ok: true; anotar: boolean }
  | { ok: false; motivo: 'nao_cadastrado' | 'inativo' };

/**
 * Verifica se o telefone pode usar o sistema.
 * - não encontrado            → { ok:false, motivo:'nao_cadastrado' }
 * - encontrado mas ativo=false → { ok:false, motivo:'inativo' }
 * - encontrado e ativo=true    → { ok:true, anotar }
 * Em caso de ERRO de infra (DB fora), FALHA ABERTO (libera) pra não travar todo
 * mundo por um problema transitório — e loga.
 */
export async function verificarTelefone(telefone: string): Promise<Autorizacao> {
  const variacoes = variacoesTelefone(telefone);
  const { data, error } = await sb()
    .from('telefones')
    .select('id, ativo, anotar')
    .in('telefone', variacoes)
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error('autorizacao_erro', { telefone, message: error.message });
    return { ok: true, anotar: true }; // fail-open em erro de infra
  }
  if (!data) {
    log.warn('autorizacao_nao_cadastrado', { telefone });
    return { ok: false, motivo: 'nao_cadastrado' };
  }
  if (!data.ativo) {
    log.warn('autorizacao_inativo', { telefone });
    return { ok: false, motivo: 'inativo' };
  }
  return { ok: true, anotar: !!data.anotar };
}

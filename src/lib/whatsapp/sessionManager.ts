/**
 * Session Manager — Gerencia sessões de conversa do WhatsApp.
 *
 * Cada motorista/gestor tem uma sessão ativa na tabela `sessoes_whatsapp`.
 * A sessão guarda o estado atual da conversa (aguardando_foto_km, etc)
 * e o contexto (veículo selecionado, frete ativo, etc).
 *
 * Expira automaticamente após 24h sem interação.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('sessionManager');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── TIPOS ────────────────────────────────────────────────────────────

export type EstadoSessao =
  | 'novo'
  | 'aguardando_veiculo'
  | 'aguardando_acao'
  | 'aguardando_foto_km'
  | 'aguardando_confirmacao_km'
  | 'aguardando_km_manual'
  | 'aguardando_avaria_midia'
  | 'aguardando_confirmacao_avaria'
  | 'aguardando_origem_destino'
  | 'aguardando_cliente'
  | 'aguardando_valor_pedido'
  | 'aguardando_foto_abastecimento'
  | 'aguardando_confirmacao_abastecimento'
  | 'aguardando_checklist'
  | 'aguardando_adiantamento_tipo'
  | 'aguardando_adiantamento_valor'
  | 'aguardando_confirmacao_adiantamento'
  | 'aguardando_despesa_tipo'
  | 'aguardando_despesa_foto'
  | 'aguardando_confirmacao_despesa'
  | 'aguardando_imprevisto_tipo'
  | 'aguardando_imprevisto_tempo'
  | 'aguardando_imprevisto_midia'
  | 'aguardando_documento_tipo'
  | 'aguardando_confirmacao_apagar'
  | 'inferindo_intencao'
  // Gestor
  | 'aguardando_confirmacao_pedido'
  | 'aguardando_motorista_pedido'
  | 'aguardando_veiculo_pedido'
  | 'aguardando_correcao_pedido';

export type ContextoSessao = {
  veiculo_id?: string;
  veiculo_placa?: string;
  pedido_id?: string;
  motorista_id?: string;
  km_lido?: number;
  km_confianca?: number;
  avaria_dados?: Record<string, unknown>;
  abastecimento_dados?: Record<string, unknown>;
  despesa_dados?: Record<string, unknown>;
  adiantamento_dados?: Record<string, unknown>;
  imprevisto_dados?: Record<string, unknown>;
  pedido_dados?: Record<string, unknown>;
  checklist_index?: number;
  checklist_respostas?: Record<string, boolean>;
  foto_url?: string;
  /** Alvo do "apaga o último" aguardando confirmação (tabela + id + descrição do preview) */
  apagar_alvo?: { tabela: string; id: string; descricao: string; veiculo_id?: string };
  /** Opcoes do menu numerado mais recente, para resolver respostas tipo "1", "2" → id original.
   *  `tipo_original` indica se o handler original esperava resposta de lista ou de botao. */
  menu_opcoes?: {
    tipo_original: 'lista' | 'botao';
    opcoes: Array<{ id: string; titulo: string }>;
  };
  [key: string]: unknown;
};

export type Sessao = {
  id: string;
  whatsapp: string;
  motorista_id: string | null;
  /** Resolvido em runtime a partir de perfis.motorista_id — não persistido em sessoes_whatsapp */
  usuario_id: string | null;
  empresa_id: string;
  estado: EstadoSessao;
  contexto: ContextoSessao;
  ultimo_contato: string;
};

// ─── FUNÇÕES ──────────────────────────────────────────────────────────

/**
 * Busca ou cria uma sessão para o número do WhatsApp.
 */
export async function getOrCreateSession(params: {
  whatsapp: string;
  motorista_id?: string | null;
  usuario_id?: string | null;
  empresa_id: string;
}): Promise<Sessao> {
  const supabase = getServiceClient();
  const { whatsapp, motorista_id, usuario_id, empresa_id } = params;

  // 1. Buscar sessão ativa (< 24h)
  const { data: existing } = await supabase
    .from('sessoes_whatsapp')
    .select('*')
    .eq('whatsapp', whatsapp)
    .gt('ultimo_contato', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('ultimo_contato', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('sessoes_whatsapp')
      .update({ ultimo_contato: new Date().toISOString() })
      .eq('id', existing.id);

    return {
      id: existing.id,
      whatsapp: existing.whatsapp,
      motorista_id: existing.motorista_id ?? null,
      usuario_id: usuario_id ?? null,
      empresa_id: existing.empresa_id ?? empresa_id,
      estado: existing.estado as EstadoSessao,
      contexto: (existing.contexto as ContextoSessao) ?? {},
      ultimo_contato: existing.ultimo_contato,
    };
  }

  // 2. Criar (ou reaproveitar) sessão. UPSERT em vez de INSERT porque a coluna
  // whatsapp tem UNIQUE constraint: se a sessão expirou (> 24h) o SELECT acima
  // devolve null mas a linha continua existindo — INSERT puro quebra com 23505.
  // O upsert reseta estado='novo' e contexto={} ao reentrar após expiração.
  const { data: newSession, error } = await supabase
    .from('sessoes_whatsapp')
    .upsert(
      {
        whatsapp,
        motorista_id: motorista_id ?? null,
        empresa_id,
        estado: 'novo',
        contexto: {},
        ultimo_contato: new Date().toISOString(),
      },
      { onConflict: 'whatsapp' }
    )
    .select()
    .single();

  if (error || !newSession) {
    log.error('upsert_failed', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
    });
    return {
      id: 'temp-' + Date.now(),
      whatsapp,
      motorista_id: motorista_id ?? null,
      usuario_id: usuario_id ?? null,
      empresa_id,
      estado: 'novo',
      contexto: {},
      ultimo_contato: new Date().toISOString(),
    };
  }

  return {
    id: newSession.id,
    whatsapp: newSession.whatsapp,
    motorista_id: newSession.motorista_id ?? null,
    usuario_id: usuario_id ?? null,
    empresa_id: newSession.empresa_id ?? empresa_id,
    estado: newSession.estado as EstadoSessao,
    contexto: (newSession.contexto as ContextoSessao) ?? {},
    ultimo_contato: newSession.ultimo_contato,
  };
}

export type UpdateSessionResult =
  | { ok: true }
  | { ok: false; codigo: 'sessao_perdida' | 'db_error'; erro: string };

/**
 * Atualiza o estado e/ou contexto de uma sessão.
 *
 * Usa a RPC `update_session_atomic` (FOR UPDATE + merge jsonb) pra evitar
 * race condition entre 2 mensagens em rajada do mesmo telefone (B19) e
 * detecta sessão removida entre turnos (B20).
 *
 * Retorna `{ ok: false, codigo: 'sessao_perdida' }` se a sessão sumiu;
 * o caller deve tratar (ex: reiniciar fluxo, pedir "envie Oi" pro motorista).
 */
export async function updateSession(
  sessionId: string,
  updates: {
    estado?: EstadoSessao;
    contexto?: Partial<ContextoSessao>;
  }
): Promise<UpdateSessionResult> {
  // Não persistir sessões temporárias
  if (sessionId.startsWith('temp-')) return { ok: true };

  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('update_session_atomic', {
    p_session_id: sessionId,
    p_estado: updates.estado ?? null,
    p_contexto_patch: updates.contexto ?? {},
  });

  if (error) {
    log.error('update_failed', {
      code: error.code,
      message: error.message,
      session_id: sessionId,
    });
    return { ok: false, codigo: 'db_error', erro: error.message };
  }

  // RPC retorna NULL quando a linha sumiu (sessao removida entre turnos).
  // PostgREST devolve isso como `null` no `data`.
  if (data === null || (Array.isArray(data) && data.length === 0)) {
    log.warn('sessao_perdida', { session_id: sessionId });
    return { ok: false, codigo: 'sessao_perdida', erro: 'sessao nao encontrada' };
  }

  return { ok: true };
}

/**
 * Reseta a sessão para o menu principal (estado = aguardando_acao).
 * Mantém veiculo_id no contexto.
 */
export async function resetToMenu(sessionId: string): Promise<void> {
  if (sessionId.startsWith('temp-')) return;

  const supabase = getServiceClient();

  const { data: current } = await supabase
    .from('sessoes_whatsapp')
    .select('contexto')
    .eq('id', sessionId)
    .single();

  const currentCtx = (current?.contexto as ContextoSessao) ?? {};

  await supabase
    .from('sessoes_whatsapp')
    .update({
      estado: 'aguardando_acao',
      contexto: {
        veiculo_id: currentCtx.veiculo_id,
        veiculo_placa: currentCtx.veiculo_placa,
      },
      ultimo_contato: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Encerra a sessao do usuario: estado='novo' e contexto totalmente limpo.
 * Diferente de resetToMenu que preserva o veiculo selecionado. Usado quando
 * o usuario escolhe "🚪 Sair" no menu numerado — proxima mensagem vai
 * comecar do zero pela selecao de caminhao.
 */
export async function encerrarSessao(sessionId: string): Promise<void> {
  if (sessionId.startsWith('temp-')) return;

  const supabase = getServiceClient();

  await supabase
    .from('sessoes_whatsapp')
    .update({
      estado: 'novo',
      contexto: {},
      ultimo_contato: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Encerra (deleta) sessões expiradas (> 24h).
 * Pode ser chamada por um cron job / Edge Function.
 */
export async function limparSessoesExpiradas(): Promise<number> {
  const supabase = getServiceClient();
  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('sessoes_whatsapp')
    .delete()
    .lt('ultimo_contato', limite)
    .select('id');

  if (error) {
    log.error('cleanup_failed', { code: error.code, message: error.message });
    return 0;
  }

  return data?.length ?? 0;
}

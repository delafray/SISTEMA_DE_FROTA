/**
 * Tool (function calling) da IA — VIRGEM.
 *
 * Por decisão do dono (05/06/2026), a IA não tem regra nenhuma: a ÚNICA tool é
 * `criar_lembrete` (escreve a anotação no painel). Todas as outras tools (KM,
 * listar veículos/motoristas) foram REMOVIDAS sem deixar vestígio. As regras
 * serão reconstruídas do zero conforme o dono pedir. Ver docs/LEMBRETES_SEM_TRAVA.md.
 *
 * Sempre grava via service-role (sem RLS) — qualquer número anota.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';

const log = createLogger('frota-tools');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Declaração pro Gemini (só criar_lembrete) ───────────────────────

export const declarations: FunctionDeclaration[] = [
  {
    name: 'criar_lembrete',
    description:
      'Salva uma anotação (lembrete) no painel de controle. ' +
      'Passe no campo texto o conteúdo a ser anotado.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        texto: {
          type: SchemaType.STRING,
          description: 'O conteúdo da anotação.',
        },
      },
      required: ['texto'],
    },
  },
];

// ─── Implementação ────────────────────────────────────────────────────

export interface ResultadoTool {
  ok: boolean;
  dados?: unknown;
  erro?: string;
  /** Codigo de erro tipado pra discriminar handling no caller (logging, retry, refusal). */
  codigo?: 'sem_permissao' | 'nao_encontrado' | 'validacao' | 'db';
}

/**
 * SEM TRAVA: empresa default pra quando o remetente é desconhecido (não tem
 * empresa). A tabela `lembretes.empresa_id` é NOT NULL, então todo lembrete
 * precisa de alguma empresa — usamos a primeira cadastrada. "Depois a gente
 * filtra" por empresa. Override explícito: env LEMBRETE_EMPRESA_DEFAULT.
 */
async function getEmpresaDefault(): Promise<string | null> {
  const fromEnv = process.env.LEMBRETE_EMPRESA_DEFAULT;
  if (fromEnv) return fromEnv;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('empresas')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function criarLembrete(
  empresaId: string,
  usuarioId: string | undefined,
  texto: unknown,
  criadoPorNome?: string,
  criadoPorTelefone?: string
): Promise<ResultadoTool> {
  // SEM TRAVA: QUALQUER número (cadastrado ou não) gera lembrete. Só exige texto.
  // empresa_id e usuario_id são OPCIONAIS aqui. Enquanto o schema ainda exigir
  // empresa_id (NOT NULL), preenchemos com a empresa default pra não travar; após
  // rodar `migration_lembretes_sem_trava.sql` a coluna aceita null e isso vira no-op.
  let empId: string | null = empresaId || null;
  if (!empId) empId = await getEmpresaDefault();
  const conteudo = typeof texto === 'string' ? texto.trim() : '';
  if (!conteudo) return { ok: false, erro: 'texto do lembrete vazio', codigo: 'validacao' };

  const supabase = getSupabase();
  const { error } = await supabase.from('lembretes').insert({
    empresa_id: empId,
    usuario_id: usuarioId ?? null,
    texto: conteudo,
    origem: 'whatsapp',
    criado_por_nome: criadoPorNome ?? null,
    criado_por_telefone: criadoPorTelefone ?? null,
  });

  if (error) {
    log.error('criar_lembrete_erro', { empresaId, message: error.message });
    return { ok: false, erro: error.message, codigo: 'db' };
  }

  return { ok: true, dados: { texto: conteudo, salvo: true } };
}

// ─── Dispatcher (chamado pelo geminiClient quando Gemini pede tool) ──

export async function executarTool(
  nome: string,
  empresaId: string,
  motoristaId?: string,
  args?: Record<string, unknown>,
  usuarioId?: string,
  remetente?: { nome?: string; telefone?: string }
): Promise<ResultadoTool> {
  const usrId = typeof usuarioId === 'string' && usuarioId.trim() !== '' ? usuarioId : undefined;
  switch (nome) {
    case 'criar_lembrete':
      return criarLembrete(empresaId, usrId, args?.texto, remetente?.nome, remetente?.telefone);
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` };
  }
}

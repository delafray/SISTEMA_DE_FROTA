/**
 * KPIs financeiros somados no SERVIDOR via RPC (db/migration_kpis_financeiro.sql).
 *
 * Antes, abastecimentos/adiantamentos/entregas baixavam TODAS as linhas via
 * loadAll só pra somar no cliente — fura a regra das listagens com 10.000+
 * registros. Cada função aqui tenta a RPC e, se ela ainda não existir no banco
 * (migration não rodada), cai no loadAll antigo — mesmo padrão de fallback do
 * faturamento com acréscimos/descontos.
 *
 * O client tipado do Supabase não conhece as RPCs novas até regenerar
 * database.types.ts (pendência conhecida) — por isso o parâmetro é `unknown`
 * com interface estrutural interna.
 */

import { loadAll } from '@/lib/utils/loadAll';

interface RespostaRpc {
  data: unknown;
  error: { message?: string } | null;
}

interface ClienteRpc {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RespostaRpc>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(tabela: string): any;
}

/** PostgREST pode serializar numeric como number ou string — normaliza. */
function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Primeira linha do resultado de uma RPC `RETURNS TABLE`, ou null se erro/vazio. */
async function linhaRpc(
  supabase: ClienteRpc,
  fn: string,
  empresaId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc(fn, { p_empresa_id: empresaId });
    if (error) return null; // função ainda não existe no banco → fallback
    const linha = Array.isArray(data) ? data[0] : data;
    return (linha ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

export interface SomasAbastecimentos {
  litros: number;
  valorTotal: number;
}

export async function somasAbastecimentos(
  supabaseRaw: unknown,
  empresaId: string
): Promise<SomasAbastecimentos> {
  const supabase = supabaseRaw as ClienteRpc;

  const linha = await linhaRpc(supabase, 'somas_abastecimentos', empresaId);
  if (linha) return { litros: num(linha.litros), valorTotal: num(linha.valor_total) };

  const linhas = await loadAll<{ litros: number; valor_total: number }>((from, to) =>
    supabase
      .from('abastecimentos')
      .select('litros,valor_total')
      .eq('empresa_id', empresaId)
      .range(from, to)
  );
  return {
    litros: linhas.reduce((s, a) => s + (a.litros ?? 0), 0),
    valorTotal: linhas.reduce((s, a) => s + (a.valor_total ?? 0), 0),
  };
}

export interface SomasAdiantamentos {
  solicitado: number;
  aprovado: number;
  pendente: number;
  prestado: number;
}

export async function somasAdiantamentos(
  supabaseRaw: unknown,
  empresaId: string
): Promise<SomasAdiantamentos> {
  const supabase = supabaseRaw as ClienteRpc;

  const linha = await linhaRpc(supabase, 'somas_adiantamentos', empresaId);
  if (linha) {
    return {
      solicitado: num(linha.solicitado),
      aprovado: num(linha.aprovado),
      pendente: num(linha.pendente),
      prestado: num(linha.prestado),
    };
  }

  const linhas = await loadAll<{ valor: number; status: string }>((from, to) =>
    supabase
      .from('adiantamentos')
      .select('valor,status')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true })
      .range(from, to)
  );
  const r: SomasAdiantamentos = { solicitado: 0, aprovado: 0, pendente: 0, prestado: 0 };
  for (const a of linhas) {
    r.solicitado += a.valor ?? 0;
    if (a.status === 'aprovado') r.aprovado += a.valor ?? 0;
    if (a.status === 'pendente') r.pendente += a.valor ?? 0;
    if (a.status === 'prestado') r.prestado += a.valor ?? 0;
  }
  return r;
}

export interface ReceitaPedidos {
  receitaTotal: number;
  receitaPaga: number;
}

export async function receitaPedidosConcluidos(
  supabaseRaw: unknown,
  empresaId: string
): Promise<ReceitaPedidos> {
  const supabase = supabaseRaw as ClienteRpc;

  const linha = await linhaRpc(supabase, 'somas_pedidos_receita', empresaId);
  if (linha) {
    return { receitaTotal: num(linha.receita_concluidos), receitaPaga: num(linha.receita_pagos) };
  }

  const [todosConc, todosPago] = await Promise.all([
    loadAll<{ valor_pedido: number | null }>((from, to) =>
      supabase.from('pedidos').select('valor_pedido').eq('empresa_id', empresaId)
        .or('status.eq.concluido,status.eq.concluida').range(from, to)
    ),
    loadAll<{ valor_pedido: number | null }>((from, to) =>
      supabase.from('pedidos').select('valor_pedido').eq('empresa_id', empresaId)
        .or('status.eq.concluido,status.eq.concluida').eq('pago', true).range(from, to)
    ),
  ]);
  return {
    receitaTotal: todosConc.reduce((s, r2) => s + (r2.valor_pedido ?? 0), 0),
    receitaPaga: todosPago.reduce((s, r2) => s + (r2.valor_pedido ?? 0), 0),
  };
}

/**
 * API Route — GET /api/routing/rotas
 *
 * Lista rotas otimizadas mais recentes pra mostrar no dashboard do gestor.
 *
 * Query params:
 *   - empresa_id (obrigatorio)
 *   - motorista_id (opcional, filtra)
 *   - limite (opcional, default 20, max 100)
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.11.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_rotas_list');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresa_id');
  const motoristaId = searchParams.get('motorista_id');
  const limite = Math.min(Number(searchParams.get('limite')) || 20, 100);

  if (!empresaId) {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'empresa_id' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  let query = supabase
    .from('rotas_otimizadas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criada_em', { ascending: false })
    .limit(limite);

  if (motoristaId) {
    query = query.eq('motorista_id', motoristaId);
  }

  const { data, error } = await query;

  if (error) {
    log.error('query_failed', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
  }

  // Conta paradas por rota (2ª query simples)
  const rotaIds = (data ?? []).map((r) => r.id as string);
  let paradasPorRota: Record<string, number> = {};

  if (rotaIds.length > 0) {
    const { data: paradas } = await supabase
      .from('paradas')
      .select('rota_id')
      .in('rota_id', rotaIds);

    if (paradas) {
      paradasPorRota = paradas.reduce<Record<string, number>>((acc, p) => {
        const rid = p.rota_id as string;
        acc[rid] = (acc[rid] ?? 0) + 1;
        return acc;
      }, {});
    }
  }

  // Nº do pedido vinculado (rota ancorada num despacho) — o app mostra o vínculo
  const pedidoIds = Array.from(new Set(
    (data ?? []).map((r) => r.pedido_id as string | null).filter((p): p is string => !!p)
  ));
  const numeroPorPedido: Record<string, string | null> = {};
  if (pedidoIds.length > 0) {
    const { data: peds } = await supabase
      .from('pedidos')
      .select('id,numero')
      .in('id', pedidoIds);
    for (const p of (peds ?? []) as Array<{ id: string; numero?: string | null }>) {
      numeroPorPedido[p.id] = p.numero ?? null;
    }
  }

  const enriched = (data ?? []).map((r) => ({
    ...r,
    qtd_paradas: paradasPorRota[r.id as string] ?? 0,
    numero_pedido: r.pedido_id ? (numeroPorPedido[r.pedido_id as string] ?? null) : null,
  }));

  return NextResponse.json({ rotas: enriched }, { status: 200 });
}

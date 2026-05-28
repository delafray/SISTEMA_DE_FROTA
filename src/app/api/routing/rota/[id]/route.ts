/**
 * API Route — GET /api/routing/rota/[id]
 *
 * Devolve a rota + paradas ordenadas pra alimentar a tela Ajuste-Rota.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.12.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_rota_get');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'rota_id_obrigatorio' }, { status: 400 });

  const supabase = getSupabase();

  const { data: rota, error: errRota } = await supabase
    .from('rotas_otimizadas')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (errRota) {
    log.error('rota_query_failed', { code: errRota.code, message: errRota.message });
    return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
  }
  if (!rota) return NextResponse.json({ error: 'rota_nao_encontrada' }, { status: 404 });

  const { data: paradas, error: errParadas } = await supabase
    .from('paradas')
    .select('*')
    .eq('rota_id', id)
    .order('ordem', { ascending: true });

  if (errParadas) {
    log.error('paradas_query_failed', { code: errParadas.code, message: errParadas.message });
    return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
  }

  return NextResponse.json({ rota, paradas: paradas ?? [] }, { status: 200 });
}

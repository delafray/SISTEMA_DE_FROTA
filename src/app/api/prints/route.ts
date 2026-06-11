/**
 * API Route — GET /api/prints
 *
 * Lista os últimos prints recebidos pelo bot do WhatsApp (galeria prints_zap).
 * Uso: o dono manda um print pro bot no zap → o Claude busca aqui a URL e
 * baixa a imagem pra analisar ("olha o último print do zap").
 *
 * Query params:
 *   - limite (opcional, default 10, max 50)
 *
 * Sem auth de usuario (padrao do projeto: usa SUPABASE_SERVICE_ROLE_KEY).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_prints');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const limite = Math.min(Number(searchParams.get('limite')) || 10, 50);

  const { data, error } = await getSupabase()
    .from('prints_zap')
    .select('id,telefone,nome,legenda,url,criado_em')
    .order('criado_em', { ascending: false })
    .limit(limite);

  if (error) {
    log.error('query_failed', { message: error.message });
    return NextResponse.json({ error: 'db_query_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ prints: data ?? [] }, { status: 200 });
}

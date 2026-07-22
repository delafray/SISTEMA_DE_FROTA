/**
 * API Route — POST /api/routing/notas/limpar
 *
 * Limpa todas as notas_capturadas pendentes (status='capturada' ou 'geocodificada')
 * de um motorista para iniciar uma nova rota limpa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_notas_limpar');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  try {
    const body = await request.json();
    const { motorista_id, empresa_id } = body;

    if (!motorista_id || !empresa_id) {
      return NextResponse.json(
        { error: 'params_obrigatorios', detail: 'motorista_id e empresa_id' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('notas_capturadas')
      .delete()
      .eq('motorista_id', motorista_id)
      .eq('empresa_id', empresa_id)
      .in('status', ['capturada', 'geocodificada']);

    if (error) {
      log.error('limpar_notas_falhou', { motorista_id, error });
      return NextResponse.json(
        { error: 'db_delete_failed', details: error.message },
        { status: 500 }
      );
    }

    log.info('notas_limpas_sucesso', { motorista_id });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    log.error('erro_interno_limpar_notas', { error: (err as Error).message });
    return NextResponse.json(
      { error: 'erro_interno', message: (err as Error).message },
      { status: 500 }
    );
  }
}

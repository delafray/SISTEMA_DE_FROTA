/**
 * API Route — PATCH /api/routing/rota/[id]/paradas
 *
 * Atualiza paradas da rota: ordem (reordenacao), fixada (lock/unlock),
 * janela_horario, tempo_descarga_min, observacao.
 *
 * Body: { paradas: [{ id, ordem, fixada?, janela_horario?, tempo_descarga_min?, observacao? }] }
 *
 * Por simplicidade: faz update individual por parada (UPDATE WHERE id = ...).
 * Em escala (>50 paradas) considerar batch via RPC ou stored procedure.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.12.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_paradas_patch');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface UpdateParada {
  id: string;
  ordem?: number;
  fixada?: boolean;
  janela_horario?: [string, string][] | null;
  tempo_descarga_min?: number;
  observacao?: string | null;
}

interface PatchRequest {
  paradas: UpdateParada[];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: rotaId } = await params;
  if (!rotaId) return NextResponse.json({ error: 'rota_id_obrigatorio' }, { status: 400 });

  let body: Partial<PatchRequest>;
  try {
    body = (await request.json()) as Partial<PatchRequest>;
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  if (!Array.isArray(body.paradas) || body.paradas.length === 0) {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'paradas (array)' },
      { status: 400 }
    );
  }

  // Validacao basica: toda parada precisa ter id
  for (const p of body.paradas) {
    if (!p.id) {
      return NextResponse.json({ error: 'parada_sem_id' }, { status: 400 });
    }
  }

  const supabase = getSupabase();
  const erros: Array<{ id: string; message: string }> = [];
  const sucessos: string[] = [];

  // Reordenacao via 2-pass pra evitar violar a UNIQUE(rota_id, ordem):
  // 1. Move tudo pra ordens negativas temporariamente
  // 2. Aplica as ordens finais
  // Falhas no pass 1 sao apenas logadas — o erro real e contado no pass 2.

  const temReordenacao = body.paradas.some((p) => typeof p.ordem === 'number');

  if (temReordenacao) {
    for (let i = 0; i < body.paradas.length; i++) {
      const p = body.paradas[i];
      if (typeof p.ordem === 'number') {
        const { error } = await supabase
          .from('paradas')
          .update({ ordem: -(i + 1) })
          .eq('id', p.id)
          .eq('rota_id', rotaId);
        if (error) {
          log.warn('temp_reorder_falhou', { id: p.id, message: error.message });
        }
      }
    }
  }

  // 2: aplica updates finais
  for (const p of body.paradas) {
    const update: Record<string, unknown> = {};
    if (typeof p.ordem === 'number') update.ordem = p.ordem;
    if (typeof p.fixada === 'boolean') update.fixada = p.fixada;
    if (p.janela_horario !== undefined) update.janela_horario = p.janela_horario;
    if (typeof p.tempo_descarga_min === 'number') update.tempo_descarga_min = p.tempo_descarga_min;
    if (p.observacao !== undefined) update.observacao = p.observacao;

    if (Object.keys(update).length === 0) {
      sucessos.push(p.id);
      continue;
    }

    const { error } = await supabase
      .from('paradas')
      .update(update)
      .eq('id', p.id)
      .eq('rota_id', rotaId);

    if (error) {
      erros.push({ id: p.id, message: error.message });
    } else {
      sucessos.push(p.id);
    }
  }

  if (erros.length > 0) {
    log.warn('updates_parciais', { total: body.paradas.length, sucessos: sucessos.length, erros: erros.length });
    return NextResponse.json(
      { ok: false, sucessos, erros },
      { status: erros.length === body.paradas.length ? 500 : 207 }
    );
  }

  log.info('paradas_atualizadas', { rota_id: rotaId, total: sucessos.length });
  return NextResponse.json({ ok: true, atualizadas: sucessos.length }, { status: 200 });
}

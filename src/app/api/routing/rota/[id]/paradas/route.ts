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
import { requireSessao } from '@/lib/auth/requireSessao';

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
  /** ISO timestamp da conclusao da entrega. `null` = desmarcar (motorista
   *  errou e quer desfazer). Persiste no banco — se o motorista fechar o
   *  app, ao reabrir ve exatamente o que ja entregou. */
  concluida_em?: string | null;
}

interface PatchRequest {
  paradas: UpdateParada[];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
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

  // ─── Estrategia 2-pass robusta pra reordenacao ───────────────────────
  //
  // Historia dos bugs:
  // - v1 movia pra negativos APENAS as paradas do request → colidia com
  //   paradas que nao estavam no request (duplicate key).
  // - v2 movia TODAS pra negativos → batia na CHECK constraint
  //   `paradas_ordem_positiva` (ordem deve ser > 0).
  //
  // v3 (agora): usa temp = max(ordens existentes) + i. Valores positivos
  // ALTOS, garantidamente > qualquer ordem atual da rota, unicos entre si.
  // Pass 2 aplica positivos baixos (do request) — sem colisao porque tempos
  // estao na faixa alta. Pass 3 da pros nao-no-request ordens apos max
  // do request — tambem baixos, sem colisao porque outros ja foram baixados.

  const temReordenacao = body.paradas.some((p) => typeof p.ordem === 'number');

  // Fetch todas paradas do rota (precisamos saber QUAIS existem no banco)
  const { data: dbParadasRaw, error: errFetch } = await supabase
    .from('paradas')
    .select('id, ordem')
    .eq('rota_id', rotaId)
    .order('ordem');

  if (errFetch) {
    log.error('fetch_paradas_falhou', { message: errFetch.message });
    return NextResponse.json({ error: 'db_fetch_failed' }, { status: 500 });
  }
  const dbParadas = (dbParadasRaw ?? []) as Array<{ id: string; ordem: number }>;

  // tempBase >= todas as ordens atuais → tempos nao colidem com ordens
  // existentes em pass 1. Pass 2 vai aplicar valores BAIXOS (request) que
  // tambem nao colidem com tempos altos.
  const maxOrdemAtual = dbParadas.reduce((acc, p) => Math.max(acc, p.ordem), 0);
  const tempBase = maxOrdemAtual + 1;

  if (temReordenacao) {
    // Pass 1: move TODAS pra tempos altos unicos (tempBase, tempBase+1, ...).
    // .select('id') detecta silenciosamente 0-rows (RLS, id errado).
    for (let i = 0; i < dbParadas.length; i++) {
      const tempOrdem = tempBase + i;
      const { data, error } = await supabase
        .from('paradas')
        .update({ ordem: tempOrdem })
        .eq('id', dbParadas[i].id)
        .eq('rota_id', rotaId)
        .select('id');
      if (error) {
        log.error('temp_reorder_falhou', { id: dbParadas[i].id, message: error.message });
        return NextResponse.json(
          { error: 'pass1_falhou', detail: error.message, parada_id: dbParadas[i].id },
          { status: 500 }
        );
      }
      if (!data || data.length === 0) {
        log.error('temp_reorder_0_rows', { id: dbParadas[i].id });
        return NextResponse.json(
          {
            error: 'pass1_silencioso',
            detail: `Nao consegui mover parada ${dbParadas[i].id} pro temp. RLS?`,
          },
          { status: 500 }
        );
      }
    }
  }

  // 2: aplica updates finais
  // IMPORTANTE: usa `.select('id')` apos cada update — sem isso, supabase-js
  // devolve `data: null, error: null` mesmo quando 0 linhas foram atualizadas
  // (ex: RLS bloqueia, id nao bate). Antes o motorista via "Salvou!" mas
  // ao voltar pra tela a ordem velha estava la — UPDATE retornava sucesso
  // mas nao tocava em nenhuma linha. RETURNING via .select() obriga o
  // banco a devolver as linhas afetadas, expondo o problema.
  for (const p of body.paradas) {
    const update: Record<string, unknown> = {};
    if (typeof p.ordem === 'number') update.ordem = p.ordem;
    if (typeof p.fixada === 'boolean') update.fixada = p.fixada;
    if (p.janela_horario !== undefined) update.janela_horario = p.janela_horario;
    if (typeof p.tempo_descarga_min === 'number') update.tempo_descarga_min = p.tempo_descarga_min;
    if (p.observacao !== undefined) update.observacao = p.observacao;
    if (p.concluida_em !== undefined) update.concluida_em = p.concluida_em;

    if (Object.keys(update).length === 0) {
      sucessos.push(p.id);
      continue;
    }

    const { data, error } = await supabase
      .from('paradas')
      .update(update)
      .eq('id', p.id)
      .eq('rota_id', rotaId)
      .select('id'); // RETURNING — vazio se nenhum row foi atualizado

    if (error) {
      erros.push({ id: p.id, message: error.message });
    } else if (!data || data.length === 0) {
      // Update silenciosamente nao tocou em nenhuma linha — bug invisivel
      // antes. Pode ser: RLS, id inexistente, rota_id errado, etc.
      erros.push({
        id: p.id,
        message: 'nenhuma_linha_atualizada (RLS? id incorreto? rota_id incorreto?)',
      });
    } else {
      sucessos.push(p.id);
    }
  }

  // Pass 3: paradas que estao no DB mas nao no request com ordem.
  // Elas estao com ordens temporarias ALTAS (tempBase+i) — precisam voltar
  // pra valores baixos definitivos.
  // Estrategia: dao ordens sequenciais APOS o max do request (preserva o que
  // o usuario reordenou, e empurra o desconhecido pro final). Mantem ordem
  // relativa entre si (original ordem ASC).
  if (temReordenacao && erros.length === 0) {
    const idsNoRequest = new Set(
      body.paradas.filter((p) => typeof p.ordem === 'number').map((p) => p.id)
    );
    const ordensDoRequest = body.paradas
      .filter((p) => typeof p.ordem === 'number')
      .map((p) => p.ordem as number);
    const maxRequestOrdem = ordensDoRequest.length > 0 ? Math.max(...ordensDoRequest) : 0;
    const naoNoRequest = dbParadas.filter((p) => !idsNoRequest.has(p.id));
    let nextOrdem = maxRequestOrdem + 1;
    for (const p of naoNoRequest) {
      const { error } = await supabase
        .from('paradas')
        .update({ ordem: nextOrdem })
        .eq('id', p.id)
        .eq('rota_id', rotaId)
        .select('id');
      if (error) {
        log.error('pass3_restore_falhou', { id: p.id, message: error.message });
        erros.push({ id: p.id, message: `pass3: ${error.message}` });
      }
      nextOrdem++;
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

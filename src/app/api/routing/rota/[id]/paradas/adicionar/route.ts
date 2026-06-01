/**
 * API Route — POST /api/routing/rota/[id]/paradas/adicionar
 *
 * Adiciona uma nova parada a uma rota existente, sem disparar reoptimizacao
 * completa (preserva ordem manual que o motorista ja fez).
 *
 * Body: {
 *   motorista_id, empresa_id,
 *   cep, numero, endereco,
 *   posicao: 'final' | 'reotimizar'
 * }
 *
 * Comportamento por modo:
 * - posicao='final': insere com ordem = max(ordens) + 1 (vai pro fim da fila)
 * - posicao='reotimizar': aplica cheapest insertion (Haversine) — encontra o
 *   "buraco" entre 2 paradas existentes que minimiza o KM adicional total
 *
 * Fluxo:
 * 1. Validar body
 * 2. Geocodificar endereco (Nominatim)
 * 3. INSERT em notas_capturadas
 * 4. Buscar paradas existentes da rota
 * 5. Calcular ordem nova (final ou cheapest insertion)
 * 6. Se cheapest insertion: shift ordens >= novaOrdem usando 2-pass (UNIQUE)
 * 7. INSERT em paradas
 * 8. Devolve { parada_id, ordem }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';
import { cheapestInsertion } from '@/lib/routing/utils';
import type { EnderecoCEP } from '@/lib/cep/types';

const log = createLogger('api_paradas_adicionar');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AdicionarRequest {
  motorista_id: string;
  empresa_id: string;
  cep: string;
  numero: string;
  endereco: EnderecoCEP;
  posicao: 'final' | 'reotimizar';
}

function camposFaltando(b: Partial<AdicionarRequest>): string[] {
  const faltando: string[] = [];
  if (!b.motorista_id) faltando.push('motorista_id');
  if (!b.empresa_id) faltando.push('empresa_id');
  // CEP e OPCIONAL: avenida longa tem varios CEPs (sem 1 unico) — a parada e
  // localizada por rua+cidade+numero (resolverCoordenada). Nao bloquear.
  if (!b.numero) faltando.push('numero');
  if (!b.endereco) faltando.push('endereco');
  if (!b.posicao) faltando.push('posicao');
  return faltando;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: rotaId } = await params;
  if (!rotaId) {
    return NextResponse.json({ error: 'rota_id_obrigatorio' }, { status: 400 });
  }

  let body: Partial<AdicionarRequest>;
  try {
    body = (await request.json()) as Partial<AdicionarRequest>;
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  const faltando = camposFaltando(body);
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: 'campos_faltando', detail: faltando },
      { status: 400 }
    );
  }
  if (body.posicao !== 'final' && body.posicao !== 'reotimizar') {
    return NextResponse.json(
      { error: 'posicao_invalida', detail: "deve ser 'final' ou 'reotimizar'" },
      { status: 400 }
    );
  }

  // 1. Resolver coordenada por prioridade: aprendida (frota) > Overpass
  // confirmado > Nominatim com fallback progressivo. Mesma estrategia do
  // /otimizar — define tambem a confianca pra navegacao por coord vs endereco.
  const coord = await resolverCoordenada({
    empresa_id: body.empresa_id!,
    logradouro: body.endereco!.logradouro,
    numero: body.numero,
    bairro: body.endereco!.bairro,
    cidade: body.endereco!.cidade,
    uf: body.endereco!.uf,
    cep: body.cep,
  });
  if (!coord) {
    log.warn('geocoding_falhou', { rota_id: rotaId });
    return NextResponse.json(
      { error: 'geocoding_falhou', motivo: 'nao_encontrado' },
      { status: 422 }
    );
  }

  const supabase = getSupabase();
  const agora = new Date().toISOString();

  // 2. INSERT nota
  const { data: notaInserida, error: errNota } = await supabase
    .from('notas_capturadas')
    .insert({
      motorista_id: body.motorista_id!,
      empresa_id: body.empresa_id!,
      cep: body.cep ?? '',
      numero: body.numero!,
      endereco: body.endereco!,
      latitude: coord.lat,
      longitude: coord.lng,
      status: 'em_rota',
      capturado_em: agora,
      sincronizado_em: agora,
    })
    .select('id')
    .single();

  if (errNota || !notaInserida) {
    log.error('insert_nota_failed', { message: errNota?.message });
    return NextResponse.json(
      { error: 'db_insert_nota_failed', detail: errNota?.message },
      { status: 500 }
    );
  }

  // 3. Busca paradas existentes pra calcular a ordem
  const { data: existentes, error: errFetch } = await supabase
    .from('paradas')
    .select('id, ordem, latitude, longitude')
    .eq('rota_id', rotaId)
    .order('ordem');

  if (errFetch) {
    log.error('fetch_paradas_failed', { message: errFetch.message });
    return NextResponse.json({ error: 'db_fetch_failed' }, { status: 500 });
  }

  type ParadaMin = { id: string; ordem: number; latitude: number; longitude: number };
  const paradasExistentes = (existentes ?? []) as ParadaMin[];

  // 4. Calcula ordem nova
  let novaOrdem: number;
  if (body.posicao === 'final') {
    novaOrdem = paradasExistentes.length + 1;
  } else {
    // cheapest insertion
    novaOrdem = cheapestInsertion(
      paradasExistentes.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      { lat: coord.lat, lng: coord.lng }
    );
  }

  // 5. Se cheapest insertion, shift paradas >= novaOrdem (+1) usando 2-pass
  // pra evitar violar UNIQUE(rota_id, ordem).
  //
  // Ordens temporarias POSITIVAS e ALTAS (acima de qualquer existente) — NUNCA
  // negativas: a tabela paradas tem CHECK (ordem > 0), entao `-p.ordem` era
  // rejeitado, o pass 1 falhava silencioso e o pass 2 colidia no UNIQUE
  // (db_shift_falhou). Mesma estrategia do PATCH /paradas.
  if (body.posicao === 'reotimizar' && novaOrdem <= paradasExistentes.length) {
    const aMover = paradasExistentes.filter((p) => p.ordem >= novaOrdem);
    const maxOrdem = paradasExistentes.reduce((m, p) => Math.max(m, p.ordem), 0);
    const tempBase = maxOrdem + 1;

    // Pass 1: move pra ordens temporarias altas (libera os slots originais)
    for (let i = 0; i < aMover.length; i++) {
      const { error } = await supabase
        .from('paradas')
        .update({ ordem: tempBase + i })
        .eq('id', aMover[i].id);
      if (error) {
        log.error('shift_temp_falhou', { id: aMover[i].id, message: error.message });
        return NextResponse.json(
          { error: 'db_shift_falhou', detail: error.message },
          { status: 500 }
        );
      }
    }
    // Pass 2: aplica ordens finais (ordem original + 1)
    for (const p of aMover) {
      const { error } = await supabase
        .from('paradas')
        .update({ ordem: p.ordem + 1 })
        .eq('id', p.id);
      if (error) {
        log.error('shift_final_falhou', { id: p.id, message: error.message });
        return NextResponse.json(
          { error: 'db_shift_falhou', detail: error.message },
          { status: 500 }
        );
      }
    }
  }

  // 6. INSERT nova parada
  const { data: paradaInserida, error: errParada } = await supabase
    .from('paradas')
    .insert({
      rota_id: rotaId,
      nota_id: notaInserida.id,
      ordem: novaOrdem,
      endereco: { ...body.endereco!, numero: body.numero, coord_confianca: coord.confianca },
      latitude: coord.lat,
      longitude: coord.lng,
      fixada: false,
      janela_horario: null,
      tempo_descarga_min: 5,
      observacao: null,
    })
    .select('id')
    .single();

  if (errParada || !paradaInserida) {
    log.error('insert_parada_failed', { message: errParada?.message });
    return NextResponse.json(
      { error: 'db_insert_parada_failed', detail: errParada?.message },
      { status: 500 }
    );
  }

  log.info('parada_adicionada', {
    rota_id: rotaId,
    parada_id: paradaInserida.id,
    ordem: novaOrdem,
    posicao: body.posicao,
  });

  return NextResponse.json(
    { ok: true, parada_id: paradaInserida.id, ordem: novaOrdem },
    { status: 201 }
  );
}

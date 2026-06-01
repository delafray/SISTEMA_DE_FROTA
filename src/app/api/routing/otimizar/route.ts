/**
 * API Route — POST /api/routing/otimizar
 *
 * Recebe um motorista_id + empresa_id + (opcional) data + (opcional) origem,
 * busca as notas_capturadas pendentes do motorista, geocodifica as que
 * faltarem coords, chama VROOM, persiste rotas_otimizadas + paradas no banco
 * e devolve o resultado pronto pra UI desenhar.
 *
 * Fluxo:
 * 1. Validar body
 * 2. Buscar notas_capturadas com status='capturada' ou 'geocodificada'
 * 3. Geocodificar as que faltam lat/lng (chama Nominatim)
 * 4. Atualizar lat/lng dessas notas no banco
 * 5. Montar Jobs + Veiculo, chamar VROOM
 * 6. Inserir rotas_otimizadas + paradas no banco
 * 7. Devolver { rota_id, paradas, distancia_total_km, tempo_total_min, nao_atendidas }
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.10.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { otimizarRota } from '@/lib/routing/vroom';
import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';
import {
  indexarJobs,
  notaParaJob,
  montarVeiculo,
  traduzirParadasComMapping,
  montarParadasPersistir,
} from '@/lib/routing/restricoes';
import type { Coordenada, NotaCapturada } from '@/lib/routing/types';

const log = createLogger('api_routing_otimizar');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── TIPOS ──────────────────────────────────────────────────────────

interface OtimizarRequest {
  motorista_id: string;
  empresa_id: string;
  data?: string;                       // YYYY-MM-DD, default = hoje
  origem: Coordenada;                  // ponto de partida do veiculo
  destino?: Coordenada;                // ponto de chegada (default = origem)
}

interface OtimizarResponse {
  rota_id: string;
  paradas: Array<{
    nota_id: string;
    ordem: number;
    endereco: NotaCapturada['endereco'];
    latitude: number;
    longitude: number;
    chegada_estimada: string;
  }>;
  distancia_total_km: number;
  tempo_total_min: number;
  nao_atendidas: string[];
}

// ─── HELPERS ────────────────────────────────────────────────────────

async function buscarNotas(
  supabase: ReturnType<typeof getSupabase>,
  motoristaId: string
): Promise<NotaCapturada[]> {
  const { data, error } = await supabase
    .from('notas_capturadas')
    .select('*')
    .eq('motorista_id', motoristaId)
    .in('status', ['capturada', 'geocodificada']);

  if (error) throw new Error(`buscar_notas_failed: ${error.message}`);
  return (data ?? []) as NotaCapturada[];
}

async function geocodarPendentes(
  supabase: ReturnType<typeof getSupabase>,
  notas: NotaCapturada[]
): Promise<{ geocodificadas: NotaCapturada[]; sem_geocoding: string[] }> {
  const geocodificadas: NotaCapturada[] = [];
  const sem_geocoding: string[] = [];

  for (const nota of notas) {
    if (nota.latitude !== null && nota.longitude !== null) {
      geocodificadas.push(nota);
      continue;
    }

    // Resolve a melhor coordenada por prioridade: aprendida (frota) > Overpass
    // confirmado > Nominatim com fallback. Define tambem a confianca, que
    // propaga pro snapshot da parada (navegacao por coord vs por endereco).
    const coord = await resolverCoordenada({
      empresa_id: nota.empresa_id,
      logradouro: nota.endereco.logradouro,
      numero: nota.numero,
      bairro: nota.endereco.bairro,
      cidade: nota.endereco.cidade,
      uf: nota.endereco.uf,
      cep: nota.cep,
    });

    if (!coord) {
      sem_geocoding.push(nota.id);
      continue;
    }

    // Atualiza a nota com as coords e marca como geocodificada
    const { error: errUp } = await supabase
      .from('notas_capturadas')
      .update({
        latitude: coord.lat,
        longitude: coord.lng,
        status: 'geocodificada',
      })
      .eq('id', nota.id);

    if (errUp) {
      log.warn('update_lat_lng_falhou', { nota_id: nota.id, message: errUp.message });
      sem_geocoding.push(nota.id);
      continue;
    }

    geocodificadas.push({
      ...nota,
      latitude: coord.lat,
      longitude: coord.lng,
      coord_confianca: coord.confianca,
      coord_fonte: coord.fonte,
      status: 'geocodificada',
    });
  }

  return { geocodificadas, sem_geocoding };
}

// ─── HANDLER ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<OtimizarRequest>;
  try {
    body = (await request.json()) as Partial<OtimizarRequest>;
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  if (!body.motorista_id || !body.empresa_id || !body.origem) {
    return NextResponse.json(
      { error: 'campos_obrigatorios', detail: 'motorista_id, empresa_id, origem' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const dataRota = body.data ?? new Date().toISOString().slice(0, 10);

  // 1. Buscar notas
  let notas: NotaCapturada[];
  try {
    notas = await buscarNotas(supabase, body.motorista_id);
  } catch (err) {
    log.error('buscar_notas_erro', { message: (err as Error).message });
    return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
  }

  if (notas.length === 0) {
    return NextResponse.json({ error: 'sem_notas' }, { status: 400 });
  }

  // 2. Geocodificar as que precisam
  const { geocodificadas, sem_geocoding } = await geocodarPendentes(supabase, notas);
  log.info('notas_geocodificadas', {
    total: notas.length,
    com_coords: geocodificadas.length,
    sem_geocoding: sem_geocoding.length,
  });

  if (geocodificadas.length === 0) {
    return NextResponse.json(
      { error: 'todas_geocoding_falharam', sem_geocoding },
      { status: 500 }
    );
  }

  // 3. Otimizar com VROOM
  // indexarJobs precisa de items com `id: string`; passamos as proprias notas
  // (que ja tem id) — sem spread duplicado.
  const { mapping, items: notasIndexadas } = indexarJobs(geocodificadas);

  const jobs = notasIndexadas.map((n) => notaParaJob(n, n._idVroom));
  const veiculo = montarVeiculo({
    id: 1,
    inicio: body.origem,
    fim: body.destino,
  });

  const otim = await otimizarRota({ veiculos: [veiculo], jobs });
  if (!otim.ok) {
    log.warn('vroom_falhou', { motivo: otim.motivo });
    return NextResponse.json(
      { error: 'otimizacao_falhou', motivo: otim.motivo },
      { status: otim.motivo === 'config_faltando' ? 503 : 500 }
    );
  }

  // 4. Persistir rota + paradas
  const { data: rotaInserida, error: errRota } = await supabase
    .from('rotas_otimizadas')
    .insert({
      motorista_id: body.motorista_id,
      empresa_id: body.empresa_id,
      data: dataRota,
      distancia_total_km: otim.resultado.distancia_total_km,
      tempo_total_min: Math.round(otim.resultado.tempo_total_min),
      status: 'otimizada',
      otimizada_em: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (errRota || !rotaInserida) {
    log.error('insert_rota_failed', { message: errRota?.message });
    return NextResponse.json({ error: 'db_insert_rota_failed' }, { status: 500 });
  }

  const paradasTraduzidas = traduzirParadasComMapping(otim.resultado.paradas, mapping);
  const notasMap = new Map(geocodificadas.map((n) => [n.id, n]));
  const paradasPayload = montarParadasPersistir(
    paradasTraduzidas,
    notasMap,
    rotaInserida.id as string
  );

  const { data: paradasInseridas, error: errParadas } = await supabase
    .from('paradas')
    .insert(paradasPayload)
    .select('*');

  if (errParadas) {
    log.error('insert_paradas_failed', { message: errParadas.message });
    return NextResponse.json({ error: 'db_insert_paradas_failed' }, { status: 500 });
  }

  // 5. Marcar notas como em_rota
  await supabase
    .from('notas_capturadas')
    .update({ status: 'em_rota' })
    .in(
      'id',
      paradasTraduzidas.map((p) => p.nota_id_local)
    );

  // Enriquece nao_atendidas com endereco + motivo pra mostrar no app.
  // Antes vinha so id; motorista nao tinha ideia de QUAIS NFs caiu.
  const notasMapPorId = new Map(notas.map((n) => [n.id, n]));
  const naoAtendidasVROOM = otim.resultado.paradas_nao_atendidas
    .map((idVroom) => mapping.get(Number(idVroom)))
    .filter((id): id is string => Boolean(id));
  const naoAtendidasDetalhe = [
    ...sem_geocoding.map((id) => ({
      id,
      motivo: 'geocoding_falhou' as const,
      endereco: notasMapPorId.get(id)?.endereco ?? null,
      numero: notasMapPorId.get(id)?.numero ?? null,
      cep: notasMapPorId.get(id)?.cep ?? null,
    })),
    ...naoAtendidasVROOM.map((id) => ({
      id,
      motivo: 'vroom_nao_encaixou' as const,
      endereco: notasMapPorId.get(id)?.endereco ?? null,
      numero: notasMapPorId.get(id)?.numero ?? null,
      cep: notasMapPorId.get(id)?.cep ?? null,
    })),
  ];

  const response: OtimizarResponse & { nao_atendidas_detalhe: typeof naoAtendidasDetalhe } = {
    rota_id: rotaInserida.id as string,
    paradas: (paradasInseridas ?? []).map((p) => ({
      nota_id: p.nota_id as string,
      ordem: p.ordem as number,
      endereco: p.endereco as NotaCapturada['endereco'],
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      chegada_estimada:
        paradasTraduzidas.find((pt) => pt.ordem === (p.ordem as number))
          ?.chegada_estimada ?? '',
    })),
    distancia_total_km: otim.resultado.distancia_total_km,
    tempo_total_min: Math.round(otim.resultado.tempo_total_min),
    nao_atendidas: naoAtendidasDetalhe.map((n) => n.id),
    nao_atendidas_detalhe: naoAtendidasDetalhe,
  };

  log.info('rota_otimizada', {
    rota_id: response.rota_id,
    paradas: response.paradas.length,
    nao_atendidas: response.nao_atendidas.length,
    sem_geocoding: sem_geocoding.length,
    vroom_excluiu: naoAtendidasVROOM.length,
  });

  return NextResponse.json(response, { status: 201 });
}

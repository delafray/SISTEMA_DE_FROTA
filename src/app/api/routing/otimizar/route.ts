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
import type { Job } from '@/lib/routing/vroom';
import {
  buscarEntregasDoPedido,
  geocodarEntregas,
  type EntregaRoteavel,
} from '@/lib/routing/geocodarEntregasPedido';

const log = createLogger('api_routing_otimizar');

// Geocoding sequencial ~1.1s/endereço por rate-limit Nominatim; precisa de margem ampla.
export const maxDuration = 300;

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
  // EMPRESA 1: quando presente, otimiza as ENTREGAS deste pedido (ramo novo),
  // em vez das notas_capturadas soltas do motorista. Ver otimizarPorPedido().
  pedido_id?: string;
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

// ─── RAMO PEDIDO (EMPRESA 1) ────────────────────────────────────────
// Otimiza as ENTREGAS nao-finalizadas de um pedido. Reusa o core VROOM
// (indexarJobs/otimizarRota) mas NAO o pipeline de notas: entregas tem
// `destino` como texto livre, geocodado por `geocodar()` (Nominatim, confianca
// sempre 'baixa'). Persiste pedido_id em rotas_otimizadas e pedido_id+entrega_id
// em paradas, e grava entregas.sequencia. Sem tocar no ramo de notas.
// buscarEntregasDoPedido e geocodarEntregas foram extraídas para
// src/lib/routing/geocodarEntregasPedido.ts e importadas acima.

/**
 * Resolve o ponto de partida do caminhao no modo pedido, em ordem:
 *  1. body.origem (se o chamador mandou) — ex: GPS do motorista.
 *  2. Deposito = endereco da empresa (geocodado por resolverCoordenada).
 *  3. Fallback: 1a entrega geocodificada (a rota so reordena os destinos).
 * Devolve null so quando nem isso ha (sem origem possivel).
 */
async function resolverOrigemPedido(
  supabase: ReturnType<typeof getSupabase>,
  body: OtimizarRequest,
  geocodificadas: EntregaRoteavel[]
): Promise<Coordenada | null> {
  if (body.origem) return body.origem;

  const { data: emp } = await supabase
    .from('empresas')
    .select('logradouro, numero, bairro, cidade, uf, cep')
    .eq('id', body.empresa_id)
    .maybeSingle();

  if (emp?.logradouro && emp?.cidade) {
    const c = await resolverCoordenada({
      empresa_id: body.empresa_id,
      logradouro: emp.logradouro ?? undefined,
      numero: emp.numero ?? undefined,
      bairro: emp.bairro ?? undefined,
      cidade: emp.cidade ?? undefined,
      uf: emp.uf ?? undefined,
      cep: emp.cep ?? undefined,
    });
    if (c) return { lat: c.lat, lng: c.lng };
  }

  const primeira = geocodificadas.find((e) => e.latitude !== null && e.longitude !== null);
  if (primeira) return { lat: primeira.latitude as number, lng: primeira.longitude as number };
  return null;
}

async function otimizarPorPedido(
  supabase: ReturnType<typeof getSupabase>,
  body: OtimizarRequest,
  dataRota: string
): Promise<NextResponse> {
  const pedidoId = body.pedido_id!;

  // 1. Buscar entregas do pedido
  let entregas: EntregaRoteavel[];
  try {
    entregas = await buscarEntregasDoPedido(supabase, pedidoId);
  } catch (err) {
    log.error('buscar_entregas_erro', { message: (err as Error).message });
    return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
  }
  if (entregas.length === 0) {
    return NextResponse.json({ error: 'sem_entregas' }, { status: 400 });
  }

  // 2. Geocodificar destinos (texto livre) e gravar de volta em entregas
  const { geocodificadas, sem_geocoding } = await geocodarEntregas(supabase, entregas);
  log.info('entregas_geocodificadas', {
    pedido_id: pedidoId,
    total: entregas.length,
    com_coords: geocodificadas.length,
    sem_geocoding: sem_geocoding.length,
  });
  if (geocodificadas.length === 0) {
    return NextResponse.json({ error: 'todas_geocoding_falharam', sem_geocoding }, { status: 500 });
  }

  // 3. Otimizar com VROOM (parada = destino da entrega)
  const origemCoord = await resolverOrigemPedido(supabase, body, geocodificadas);
  if (!origemCoord) {
    return NextResponse.json({ error: 'sem_origem' }, { status: 400 });
  }
  const { mapping, items } = indexarJobs(geocodificadas);
  const jobs: Job[] = items.map((e) => ({
    id: e._idVroom,
    localizacao: { lat: e.latitude as number, lng: e.longitude as number },
    tempo_descarga_s: e.service_time_seg ?? 600,
  }));
  const veiculo = montarVeiculo({ id: 1, inicio: origemCoord, fim: body.destino ?? origemCoord });

  const otim = await otimizarRota({ veiculos: [veiculo], jobs });
  if (!otim.ok) {
    log.warn('vroom_falhou_pedido', { pedido_id: pedidoId, motivo: otim.motivo });
    return NextResponse.json(
      { error: 'otimizacao_falhou', motivo: otim.motivo },
      { status: otim.motivo === 'config_faltando' ? 503 : 500 }
    );
  }

  // 4. Re-roteirizar SUBSTITUI: limpa rota/paradas anteriores do pedido pra nao
  //    acumular pinos duplicados a cada clique. Sem FK, delete direto por pedido.
  await supabase.from('paradas').delete().eq('pedido_id', pedidoId);
  await supabase.from('rotas_otimizadas').delete().eq('pedido_id', pedidoId);

  // 4b. Persistir rota (com pedido_id)
  const { data: rotaInserida, error: errRota } = await supabase
    .from('rotas_otimizadas')
    .insert({
      motorista_id: body.motorista_id,
      empresa_id: body.empresa_id,
      pedido_id: pedidoId,
      data: dataRota,
      distancia_total_km: otim.resultado.distancia_total_km,
      tempo_total_min: Math.round(otim.resultado.tempo_total_min),
      status: 'otimizada',
      otimizada_em: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (errRota || !rotaInserida) {
    log.error('insert_rota_pedido_failed', { message: errRota?.message });
    return NextResponse.json({ error: 'db_insert_rota_failed' }, { status: 500 });
  }

  // 5. Persistir paradas (pedido_id + entrega_id; nota_id = null)
  const paradasTraduzidas = traduzirParadasComMapping(otim.resultado.paradas, mapping);
  const entregasMap = new Map(geocodificadas.map((e) => [e.id, e]));
  const paradasPayload = paradasTraduzidas.map((p) => {
    const ent = entregasMap.get(p.nota_id_local)!;
    return {
      rota_id: rotaInserida.id as string,
      nota_id: null,
      pedido_id: pedidoId,
      entrega_id: ent.id,
      ordem: p.ordem,
      // Snapshot minimo: destino-texto + selo de confianca (sempre baixa p/
      // entrega geocodada por texto). A tela do motorista navega por endereco.
      endereco: { logradouro: ent.destino ?? '', coord_confianca: 'baixa', coord_fonte: 'nominatim' },
      latitude: ent.latitude as number,
      longitude: ent.longitude as number,
      fixada: false,
      janela_horario: null,
      tempo_descarga_min: Math.round((ent.service_time_seg ?? 600) / 60),
      observacao: ent.observacoes ?? null,
    };
  });

  const { data: paradasInseridas, error: errParadas } = await supabase
    .from('paradas')
    .insert(paradasPayload)
    .select('*');
  if (errParadas) {
    log.error('insert_paradas_pedido_failed', { message: errParadas.message });
    return NextResponse.json({ error: 'db_insert_paradas_failed' }, { status: 500 });
  }

  // 6. Gravar entregas.sequencia (= ordem na rota) — testavel sem a UI do Passo 3.
  //    Zera antes: entrega que caiu fora desta rota (geocoding falhou / VROOM
  //    nao encaixou / ja finalizada) nao pode ficar com sequencia da rota velha.
  await supabase.from('entregas').update({ sequencia: null }).eq('pedido_id', pedidoId);
  await Promise.all(
    paradasTraduzidas.map((p) =>
      supabase.from('entregas').update({ sequencia: p.ordem }).eq('id', p.nota_id_local)
    )
  );

  // 7. nao_atendidas: geocoding falho + VROOM nao encaixou
  const naoAtendidasVROOM = otim.resultado.paradas_nao_atendidas
    .map((idVroom) => mapping.get(Number(idVroom)))
    .filter((id): id is string => Boolean(id));
  const entregasMapTodas = new Map(entregas.map((e) => [e.id, e]));
  const naoAtendidasDetalhe = [
    ...sem_geocoding.map((id) => ({
      id,
      motivo: 'geocoding_falhou' as const,
      endereco: entregasMapTodas.get(id)?.destino ?? null,
    })),
    ...naoAtendidasVROOM.map((id) => ({
      id,
      motivo: 'vroom_nao_encaixou' as const,
      endereco: entregasMapTodas.get(id)?.destino ?? null,
    })),
  ];

  const response = {
    rota_id: rotaInserida.id as string,
    paradas: (paradasInseridas ?? []).map((p) => ({
      nota_id: p.entrega_id as string, // p/ entregas: o id da entrega
      entrega_id: p.entrega_id as string,
      ordem: p.ordem as number,
      endereco: p.endereco,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      chegada_estimada:
        paradasTraduzidas.find((pt) => pt.ordem === (p.ordem as number))?.chegada_estimada ?? '',
    })),
    distancia_total_km: otim.resultado.distancia_total_km,
    tempo_total_min: Math.round(otim.resultado.tempo_total_min),
    nao_atendidas: naoAtendidasDetalhe.map((n) => n.id),
    nao_atendidas_detalhe: naoAtendidasDetalhe,
  };

  log.info('rota_pedido_otimizada', {
    pedido_id: pedidoId,
    rota_id: response.rota_id,
    paradas: response.paradas.length,
    nao_atendidas: response.nao_atendidas.length,
  });

  return NextResponse.json(response, { status: 201 });
}

// ─── HANDLER ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<OtimizarRequest>;
  try {
    body = (await request.json()) as Partial<OtimizarRequest>;
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  if (!body.motorista_id || !body.empresa_id) {
    return NextResponse.json(
      { error: 'campos_obrigatorios', detail: 'motorista_id, empresa_id' },
      { status: 400 }
    );
  }
  // origem so e obrigatoria fora do modo pedido. No modo pedido ela e derivada
  // do deposito (endereco da empresa) — ver resolverOrigemPedido().
  if (!body.pedido_id && !body.origem) {
    return NextResponse.json(
      { error: 'campos_obrigatorios', detail: 'origem' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const dataRota = body.data ?? new Date().toISOString().slice(0, 10);

  // EMPRESA 1: pedido_id presente → otimiza as ENTREGAS do pedido (ramo novo),
  // sem tocar no fluxo de notas_capturadas abaixo (captura solta segue igual).
  if (body.pedido_id) {
    return otimizarPorPedido(supabase, body as OtimizarRequest, dataRota);
  }

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
    // origem garantida pela validacao do POST (obrigatoria fora do modo pedido).
    inicio: body.origem!,
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

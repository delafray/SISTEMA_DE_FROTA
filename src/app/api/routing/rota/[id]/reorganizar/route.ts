/**
 * API Route — POST /api/routing/rota/[id]/reorganizar
 *
 * Re-otimiza uma rota EXISTENTE: pega as paradas PENDENTES (nao concluidas),
 * roda o VROOM de novo a partir da posicao atual do motorista e devolve a nova
 * ordem. As paradas ja ENTREGUES ficam pinadas no topo, na ordem em que foram
 * concluidas — nao se mexe no que ja foi feito.
 *
 * Diferente de `/otimizar` (que cria uma rota NOVA a partir de notas_capturadas),
 * este endpoint reordena as paradas que ja existem. Usado pelo botao
 * "Reorganizar" da tela de ajuste-rota quando o motorista mexeu demais na mao.
 *
 * NAO grava no banco — devolve a ordem nova pro cliente aplicar e salvar pelo
 * fluxo normal (PATCH /paradas), igual ao "Inverter".
 *
 * Body: { origem?: { lat, lng } }  // default: ultima entregue > 1a pendente
 * Resposta: { ok, paradas: [{ id, ordem }], nao_atendidas: string[], reorganizou }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { otimizarRota, type Job } from '@/lib/routing/vroom';
import { indexarJobs, montarVeiculo, traduzirParadasComMapping, PRIORIDADE } from '@/lib/routing/restricoes';
import type { Coordenada, JanelaHorario } from '@/lib/routing/types';

const log = createLogger('api_routing_reorganizar');

// Roda o VROOM (timeout interno de 30s). Sem isto a function morre no default da
// Vercel (10s no Hobby) e a reorganizacao falha em rotas com muitas paradas.
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ParadaDB {
  id: string;
  ordem: number;
  latitude: number;
  longitude: number;
  fixada: boolean;
  janela_horario: JanelaHorario | null;
  tempo_descarga_min: number;
  concluida_em: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: rotaId } = await params;
  if (!rotaId) {
    return NextResponse.json({ ok: false, error: 'rota_id_obrigatorio' }, { status: 400 });
  }

  let body: { origem?: Coordenada } = {};
  try {
    body = (await request.json()) as { origem?: Coordenada };
  } catch {
    body = {};
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('paradas')
    .select('id, ordem, latitude, longitude, fixada, janela_horario, tempo_descarga_min, concluida_em')
    .eq('rota_id', rotaId)
    .order('ordem');

  if (error) {
    log.error('fetch_paradas_falhou', { rota_id: rotaId, message: error.message });
    return NextResponse.json({ ok: false, error: 'db_fetch_failed' }, { status: 500 });
  }

  const paradas = (data ?? []) as ParadaDB[];
  const concluidas = paradas.filter((p) => p.concluida_em);
  const pendentes = paradas.filter((p) => !p.concluida_em);

  // Menos de 2 pendentes — nada a reorganizar. Devolve a ordem atual.
  if (pendentes.length < 2) {
    return NextResponse.json(
      {
        ok: true,
        reorganizou: false,
        paradas: paradas.map((p) => ({ id: p.id, ordem: p.ordem })),
        nao_atendidas: [],
      },
      { status: 200 }
    );
  }

  // Origem: GPS do motorista > ultima entregue (onde ele provavelmente esta) >
  // primeira pendente.
  const ultimaConcluida = concluidas[concluidas.length - 1];
  const origem: Coordenada =
    body.origem && typeof body.origem.lat === 'number' && typeof body.origem.lng === 'number'
      ? body.origem
      : ultimaConcluida
        ? { lat: ultimaConcluida.latitude, lng: ultimaConcluida.longitude }
        : { lat: pendentes[0].latitude, lng: pendentes[0].longitude };

  // Monta jobs VROOM a partir das paradas pendentes (preserva janela de horario,
  // tempo de descarga e fixacao via prioridade maxima).
  const { mapping, items } = indexarJobs(pendentes);
  const jobs: Job[] = items.map((p) => ({
    id: p._idVroom,
    localizacao: { lat: p.latitude, lng: p.longitude },
    tempo_descarga_s: (p.tempo_descarga_min ?? 5) * 60,
    janelas: p.janela_horario ?? undefined,
    prioridade: p.fixada ? PRIORIDADE.FIXADA : 0,
  }));

  const veiculo = montarVeiculo({ id: 1, inicio: origem });
  const otim = await otimizarRota({ veiculos: [veiculo], jobs });

  if (!otim.ok) {
    log.warn('vroom_falhou', { rota_id: rotaId, motivo: otim.motivo });
    return NextResponse.json(
      { ok: false, error: 'reorganizacao_falhou', motivo: otim.motivo },
      { status: otim.motivo === 'config_faltando' ? 503 : 500 }
    );
  }

  // Traduz IDs do VROOM de volta pros ids das paradas e ordena.
  const traduzidas = traduzirParadasComMapping(otim.resultado.paradas, mapping);
  const pendentesOrdenadas = [...traduzidas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => t.nota_id_local);

  // Paradas que o VROOM nao encaixou ficam no fim (preserva — nunca somem).
  const atendidas = new Set(pendentesOrdenadas);
  const naoAtendidas = pendentes.filter((p) => !atendidas.has(p.id)).map((p) => p.id);

  // Ordem final: entregues (mantem ordem atual) + pendentes reorganizadas + nao-atendidas.
  const idsFinais = [
    ...concluidas.map((p) => p.id),
    ...pendentesOrdenadas,
    ...naoAtendidas,
  ];
  const novaOrdem = idsFinais.map((id, i) => ({ id, ordem: i + 1 }));

  log.info('rota_reorganizada', {
    rota_id: rotaId,
    pendentes: pendentes.length,
    nao_atendidas: naoAtendidas.length,
  });

  return NextResponse.json(
    { ok: true, reorganizou: true, paradas: novaOrdem, nao_atendidas: naoAtendidas },
    { status: 200 }
  );
}

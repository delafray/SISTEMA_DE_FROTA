/**
 * API Route — POST /api/pod
 *
 * Prova de Entrega (POD) do app do motorista (EMPRESA 1, Passo 4).
 *
 * Recebe { entrega_id, empresa_id?, foto_url?, latitude?, longitude?, recebedor?,
 * observacao?, tipo_ocorrencia? }, sobe a foto pro R2 (passthrough se R2 nao
 * configurado), insere um registro em `pod` e atualiza `entregas.status`.
 *
 * POD NAO E OBRIGATORIO: foto e GPS sao opcionais. So `entrega_id` e exigido.
 *
 * Sem auth de usuario (padrao do projeto: usa SUPABASE_SERVICE_ROLE_KEY). A tabela
 * `pod` ainda nao esta em database.types.ts, por isso o client e o nao-tipado de
 * `@supabase/supabase-js` (mesmo padrao de /api/routing/otimizar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { persistirMidiaNoR2, chaveMidia } from '@/lib/storage/r2';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_pod');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// tipo_ocorrencia -> entregas.status. 'entregue' fecha a entrega (concluido, status
// que a UI ja conhece); qualquer falha vira 'ocorrencia' (status novo — as paginas
// usam fallback `STATUS_LABEL[s] ?? s`, entao nao quebram). O detalhe fino (qual
// falha) fica em pod.tipo_ocorrencia.
const STATUS_POR_OCORRENCIA: Record<string, string> = {
  entregue: 'concluido',
  falha_ausencia: 'ocorrencia',
  recusada: 'ocorrencia',
  endereco_invalido: 'ocorrencia',
  devolvida: 'ocorrencia',
};

interface PodRequest {
  entrega_id: string;
  empresa_id?: string | null;
  foto_url?: string | null;   // data URL base64 ou http(s); sobe pro R2
  latitude?: number | null;
  longitude?: number | null;
  recebedor?: string | null;
  observacao?: string | null;
  tipo_ocorrencia?: string;   // default 'entregue'
}

export async function POST(req: NextRequest) {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  let body: PodRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const { entrega_id } = body;
  if (!entrega_id) {
    return NextResponse.json(
      { erro: 'campos_obrigatorios', faltando: ['entrega_id'] },
      { status: 400 }
    );
  }

  const tipo = body.tipo_ocorrencia ?? 'entregue';
  const supabase = getSupabase();

  // empresa_id: usa o do body; se faltar, busca na entrega (pra carimbar o POD).
  let empresaId = body.empresa_id ?? null;
  if (!empresaId) {
    const { data: ent } = await supabase
      .from('entregas')
      .select('empresa_id')
      .eq('id', entrega_id)
      .single();
    empresaId = (ent as { empresa_id?: string | null } | null)?.empresa_id ?? null;
  }

  // Foto OPCIONAL -> sobe pro R2 (passthrough seguro se R2 nao configurado).
  let fotoUrl: string | null = null;
  if (body.foto_url) {
    try {
      fotoUrl = await persistirMidiaNoR2(body.foto_url, chaveMidia('pod', empresaId));
    } catch (err) {
      log.warn('pod_foto_falhou', { entrega_id, error: (err as Error).message });
      fotoUrl = body.foto_url; // nao perde a referencia da foto
    }
  }

  // Insere o POD.
  const { data: pod, error: errPod } = await supabase
    .from('pod')
    .insert({
      entrega_id,
      empresa_id: empresaId,
      foto_url: fotoUrl,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      recebedor: body.recebedor ?? null,
      observacao: body.observacao ?? null,
      tipo_ocorrencia: tipo,
    })
    .select('id')
    .single();

  if (errPod) {
    log.error('pod_insert_falhou', { entrega_id, error: errPod.message });
    return NextResponse.json({ erro: 'db_pod_insert', detalhe: errPod.message }, { status: 500 });
  }

  const podId = (pod as { id: string }).id;

  // Atualiza o status da entrega.
  const novoStatus = STATUS_POR_OCORRENCIA[tipo] ?? 'concluido';
  const { error: errUpd } = await supabase
    .from('entregas')
    .update({ status: novoStatus })
    .eq('id', entrega_id);

  if (errUpd) {
    // O POD ja gravou — reporta o aviso, mas NAO perde a prova de entrega.
    log.error('pod_entrega_update_falhou', { entrega_id, error: errUpd.message });
    return NextResponse.json(
      { ok: true, pod_id: podId, status: null, aviso: 'status_nao_atualizado' },
      { status: 200 }
    );
  }

  log.info('pod_registrado', { entrega_id, tipo, status: novoStatus, tem_foto: !!fotoUrl });
  return NextResponse.json({ ok: true, pod_id: podId, status: novoStatus }, { status: 201 });
}

/**
 * API Route — POST /api/notas/sync
 *
 * Recebe UMA nota capturada do worker offline do celular e insere em
 * `notas_capturadas` via service_role do Supabase.
 *
 * Por que UMA nota por request (e nao batch):
 * - Erro parcial em batch é dor (qual item falhou?). 1 nota por POST = atomico.
 * - Sync worker no browser ja envia varias em paralelo controlado.
 * - Idempotencia futura: podemos adicionar header `Idempotency-Key: <id_local>` depois.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.2.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_notas_sync');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface SyncRequest {
  id_local: string;
  motorista_id: string;
  empresa_id: string;
  cep: string;
  numero: string;
  endereco: { logradouro: string; bairro: string; cidade: string; uf: string };
  latitude?: number | null;
  longitude?: number | null;
  observacao?: string | null;
  capturado_em: string;
}

function camposObrigatoriosFaltando(body: Partial<SyncRequest>): string[] {
  const faltando: string[] = [];
  if (!body.id_local) faltando.push('id_local');
  if (!body.motorista_id) faltando.push('motorista_id');
  if (!body.empresa_id) faltando.push('empresa_id');
  if (!body.cep) faltando.push('cep');
  if (!body.numero) faltando.push('numero');
  if (!body.endereco) faltando.push('endereco');
  if (!body.capturado_em) faltando.push('capturado_em');
  return faltando;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<SyncRequest>;
  try {
    body = (await request.json()) as Partial<SyncRequest>;
  } catch {
    log.warn('json_invalido');
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  const faltando = camposObrigatoriosFaltando(body);
  if (faltando.length > 0) {
    log.warn('campos_faltando', { faltando });
    return NextResponse.json({ error: 'campos_faltando', detail: faltando }, { status: 400 });
  }

  // Validacao adicional do formato do CEP
  if (!/^[0-9]{8}$/.test(body.cep!)) {
    log.warn('cep_formato_invalido', { cep: body.cep });
    return NextResponse.json({ error: 'cep_formato_invalido' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notas_capturadas')
    .insert({
      motorista_id: body.motorista_id!,
      empresa_id: body.empresa_id!,
      cep: body.cep!,
      numero: body.numero!,
      endereco: body.endereco!,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      observacao: body.observacao ?? null,
      status: 'capturada',
      capturado_em: body.capturado_em!,
      sincronizado_em: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    log.error('insert_failed', {
      code: error?.code,
      message: error?.message,
      id_local: body.id_local,
    });
    return NextResponse.json(
      { error: 'db_insert_failed', detail: error?.message ?? 'unknown' },
      { status: 500 }
    );
  }

  log.info('nota_sincronizada', { id_local: body.id_local, id_servidor: data.id });
  return NextResponse.json({ id_servidor: data.id }, { status: 201 });
}

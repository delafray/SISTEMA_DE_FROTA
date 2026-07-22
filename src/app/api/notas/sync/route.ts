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
import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_notas_sync');

// Geocoding sequencial ~1.1s/endereço por rate-limit Nominatim; 60s cobre casos normais.
export const maxDuration = 60;

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
  /** EMPRESA 1: pedido ao qual a nota pertence. Opcional — default null
   *  mantem o comportamento atual de captura solta (Modo B). */
  pedido_id?: string | null;
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
  // CEP e OPCIONAL: rua com varios CEPs (avenida longa) pode nao ter 1 unico —
  // a nota e localizada por rua+cidade+numero. Nao bloquear a sincronizacao.
  if (!body.numero) faltando.push('numero');
  if (!body.endereco) faltando.push('endereco');
  if (!body.capturado_em) faltando.push('capturado_em');
  return faltando;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
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

  // Validacao do formato do CEP — SO quando informado (CEP e opcional).
  if (body.cep && !/^[0-9]{8}$/.test(body.cep)) {
    log.warn('cep_formato_invalido', { cep: body.cep });
    return NextResponse.json({ error: 'cep_formato_invalido' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Geocodar na hora do sync: se o cliente não mandou coords, tenta resolver
  // agora para que o otimizar já encontre a nota pronta (sem retardatário lento).
  // Best-effort obrigatório: qualquer falha NÃO bloqueia o sync — a nota é
  // inserida com lat/lng null e status 'capturada'; o fallback no otimizar pega.
  let latFinal: number | null = body.latitude ?? null;
  let lngFinal: number | null = body.longitude ?? null;
  let statusFinal: string = 'capturada';

  if (latFinal === null || lngFinal === null) {
    try {
      const coord = await resolverCoordenada({
        empresa_id: body.empresa_id!,
        logradouro: body.endereco?.logradouro,
        numero: body.numero,
        bairro: body.endereco?.bairro,
        cidade: body.endereco?.cidade,
        uf: body.endereco?.uf,
        cep: body.cep,
      });
      if (coord) {
        latFinal = coord.lat;
        lngFinal = coord.lng;
        statusFinal = 'geocodificada';
        log.info('geocoding_sync_hit', {
          id_local: body.id_local,
          fonte: coord.fonte,
          confianca: coord.confianca,
        });
      } else {
        log.info('geocoding_sync_miss', { id_local: body.id_local });
      }
    } catch (geoErr) {
      log.warn('geocoding_sync_erro', {
        id_local: body.id_local,
        message: (geoErr as Error).message,
      });
      // continua com lat/lng null — sync nunca falha por geocoding
    }
  }

  const { data, error } = await supabase
    .from('notas_capturadas')
    .insert({
      motorista_id: body.motorista_id!,
      empresa_id: body.empresa_id!,
      pedido_id: body.pedido_id ?? null,
      cep: body.cep ?? '',
      numero: body.numero!,
      endereco: body.endereco!,
      latitude: latFinal,
      longitude: lngFinal,
      observacao: body.observacao ?? null,
      status: statusFinal,
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

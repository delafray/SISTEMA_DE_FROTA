/**
 * API Route — POST /api/motorista/atualizar-km
 *
 * Atualização de KM pelo app do motorista (tela inicial → "Atualizar KM").
 *
 * Recebe { veiculo_id, motorista_id, empresa_id, km, foto_data_url? }, sobe a
 * foto do painel pro R2 (FOTO É OPCIONAL — passthrough se R2 não configurado)
 * e insere em `km_logs` com confirmado=true: o trigger propagar_km_para_veiculo
 * atualiza veiculos.km_atual e BLOQUEIA km menor que o atual (mesmo caminho do
 * kmFlow do WhatsApp — uma regra só pra todas as origens).
 *
 * Sem auth de usuario (padrao do projeto: usa SUPABASE_SERVICE_ROLE_KEY,
 * mesmo padrao de /api/pod).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { persistirMidiaNoR2, chaveMidia } from '@/lib/storage/r2';

const log = createLogger('api_motorista_km');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AtualizarKmRequest {
  veiculo_id: string;
  motorista_id: string;
  empresa_id: string;
  km: number;
  foto_data_url?: string | null; // data URL base64 — opcional
}

export async function POST(req: NextRequest) {
  let body: AtualizarKmRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const { veiculo_id, motorista_id, empresa_id, km } = body;
  const faltando = (['veiculo_id', 'motorista_id', 'empresa_id'] as const).filter((c) => !body[c]);
  if (faltando.length > 0) {
    return NextResponse.json({ erro: 'campos_obrigatorios', faltando }, { status: 400 });
  }
  if (typeof km !== 'number' || !Number.isFinite(km) || km <= 0) {
    return NextResponse.json({ erro: 'km_invalido' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Foto do painel OPCIONAL → R2 (passthrough seguro se R2 não configurado).
  let fotoUrl: string | null = null;
  if (body.foto_data_url) {
    try {
      fotoUrl = await persistirMidiaNoR2(body.foto_data_url, chaveMidia('km', empresa_id));
    } catch (err) {
      log.warn('km_foto_falhou', { veiculo_id, error: (err as Error).message });
      // Foto é opcional — não derruba a atualização de KM por causa dela.
    }
  }

  const { error } = await supabase.from('km_logs').insert({
    veiculo_id,
    motorista_id,
    empresa_id,
    km_lido: km,
    tipo: 'checkpoint',
    confirmado: true,
    correcao: false,
    foto_urls: fotoUrl ? [fotoUrl] : null,
    ia_confianca: null,
    ia_raw_response: null,
  });

  if (error) {
    // Trigger bloqueia KM menor que o atual do caminhão.
    if (error.message?.includes('km_atual') || error.message?.includes('retroativ')) {
      return NextResponse.json(
        { erro: 'km_retroativo', detalhe: 'O KM informado é menor que o atual do caminhão.' },
        { status: 409 }
      );
    }
    log.error('km_insert_falhou', { veiculo_id, error: error.message });
    return NextResponse.json({ erro: 'db_km_insert', detalhe: error.message }, { status: 500 });
  }

  log.info('km_atualizado', { veiculo_id, motorista_id, km, tem_foto: !!fotoUrl });
  return NextResponse.json({ ok: true, km, foto_url: fotoUrl }, { status: 201 });
}

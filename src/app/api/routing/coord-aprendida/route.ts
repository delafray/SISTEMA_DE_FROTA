/**
 * API Route — POST /api/routing/coord-aprendida
 *
 * Recebe o GPS real do motorista no momento da entrega e grava como coordenada
 * aprendida daquele endereco (ver coordsAprendidas.ts). Server-side pra usar a
 * service role key e nao expor o Supabase no client.
 *
 * Body:
 *   {
 *     empresa_id: "uuid",
 *     endereco: { logradouro, numero, cidade, uf },
 *     lat: number, lng: number
 *   }
 *
 * Resposta: { ok: true } sempre que aceito; { ok: false, motivo } se invalido.
 * Estrategia "nunca atrapalha a entrega": erro aqui nunca deve travar a UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { gravarCoordAprendida, chaveEndereco } from '@/lib/routing/coordsAprendidas';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_coord_aprendida');

interface RequestBody {
  empresa_id: string;
  endereco: { logradouro?: string; numero?: string; cidade?: string; uf?: string };
  lat: number;
  lng: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  let body: Partial<RequestBody>;
  try {
    body = (await request.json()) as Partial<RequestBody>;
  } catch {
    return NextResponse.json({ ok: false, motivo: 'json_invalido' }, { status: 400 });
  }

  if (
    !body.empresa_id ||
    !body.endereco ||
    typeof body.lat !== 'number' ||
    typeof body.lng !== 'number' ||
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lng)
  ) {
    return NextResponse.json({ ok: false, motivo: 'campos_obrigatorios' }, { status: 400 });
  }

  // Sem chave valida (faltou rua/numero/cidade/uf) nao da pra aprender com
  // seguranca — recusa silenciosamente (200, nao e erro do cliente de verdade).
  if (!chaveEndereco(body.endereco)) {
    return NextResponse.json({ ok: false, motivo: 'endereco_incompleto' }, { status: 200 });
  }

  try {
    await gravarCoordAprendida(body.empresa_id, body.endereco, body.lat, body.lng);
  } catch (err) {
    log.warn('gravar_falhou', { message: (err as Error).message });
    return NextResponse.json({ ok: false, motivo: 'erro_interno' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

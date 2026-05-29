/**
 * API Route — GET + POST /api/routing/geocodar
 *
 * GET  ?q=...&lat=...&lng=...&limite=...
 *   Busca múltiplos resultados. lat/lng são usados para ordenar por proximidade.
 *   Resposta: { resultados: ResultadoGeocoding[] }
 *
 * POST { endereco }  (legado — mantido para compatibilidade)
 *   Busca 1 resultado.
 *   Resposta: { ok, resultado }
 *
 * Status HTTP:
 * - 200 OK em sucesso
 * - 400 em endereco_invalido ou nao_encontrado
 * - 503 em erro_rede / timeout do Nominatim
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.6.
 */

import { NextRequest, NextResponse } from 'next/server';
import { geocodar, geocodarMultiplos } from '@/lib/routing/geocoding';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_routing_geocodar');

interface GeocodarRequest {
  endereco: string;
}

// ─── GET /api/routing/geocodar?q=...&lat=...&lng=...&limite=... ──────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const limite = Math.min(Number(searchParams.get('limite') ?? '5'), 10);

  if (!q || q.trim().length < 3) {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'q' },
      { status: 400 }
    );
  }

  const userLat = lat ? parseFloat(lat) : undefined;
  const userLng = lng ? parseFloat(lng) : undefined;
  const hasCoords =
    userLat !== undefined && userLng !== undefined &&
    !Number.isNaN(userLat) && !Number.isNaN(userLng);

  log.info('geocodar_multiplos_req', { q, hasCoords, limite });

  const resultado = await geocodarMultiplos(
    q,
    limite,
    hasCoords ? userLat : undefined,
    hasCoords ? userLng : undefined,
  );

  if (resultado.ok) {
    return NextResponse.json({ resultados: resultado.resultados }, { status: 200 });
  }

  const statusErro =
    resultado.motivo === 'endereco_invalido' || resultado.motivo === 'nao_encontrado'
      ? 400
      : 503;
  return NextResponse.json(resultado, { status: statusErro });
}

// ─── POST /api/routing/geocodar — LEGADO ────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<GeocodarRequest>;
  try {
    body = (await request.json()) as Partial<GeocodarRequest>;
  } catch {
    log.warn('json_invalido');
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  if (!body.endereco || typeof body.endereco !== 'string') {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'endereco' },
      { status: 400 }
    );
  }

  const resultado = await geocodar(body.endereco);

  if (resultado.ok) {
    return NextResponse.json(resultado, { status: 200 });
  }

  const statusErro =
    resultado.motivo === 'endereco_invalido' || resultado.motivo === 'nao_encontrado'
      ? 400
      : 503;
  return NextResponse.json(resultado, { status: statusErro });
}


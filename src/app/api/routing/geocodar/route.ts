/**
 * API Route — POST /api/routing/geocodar
 *
 * Recebe { endereco } no body e devolve { lat, lng, endereco_normalizado }.
 * Envolve o `geocodar` server-only (que respeita rate limit do Nominatim).
 *
 * Status HTTP:
 * - 200 OK em sucesso
 * - 400 em endereco_invalido ou nao_encontrado
 * - 503 em erro_rede / timeout do Nominatim
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.6.
 */

import { NextRequest, NextResponse } from 'next/server';
import { geocodar } from '@/lib/routing/geocoding';
import { createLogger } from '@/lib/logger';

const log = createLogger('api_routing_geocodar');

interface GeocodarRequest {
  endereco: string;
}

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

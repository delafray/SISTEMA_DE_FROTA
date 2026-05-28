/**
 * API Route — GET /api/cep/[cep]
 *
 * Expoe ao browser o `consultarCEP` server-only (que usa SUPABASE_SERVICE_ROLE_KEY).
 * O componente InputEnderecoNF consome via fetch (`src/lib/cep/client.ts`).
 *
 * Sempre devolve um JSON `ResultadoCEP` no body. Status HTTP:
 * - 200 OK em sucesso
 * - 400 em CEP invalido ou nao encontrado (erro do usuario)
 * - 503 em erro de rede / timeout do ViaCEP (erro upstream)
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.3.
 */

import { NextRequest, NextResponse } from 'next/server';
import { consultarCEP } from '@/lib/cep/viacep';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cep: string }> }
): Promise<NextResponse> {
  const { cep } = await params;
  const resultado = await consultarCEP(cep);

  if (resultado.ok) {
    return NextResponse.json(resultado, { status: 200 });
  }

  const statusErro =
    resultado.motivo === 'cep_invalido' || resultado.motivo === 'nao_encontrado' ? 400 : 503;
  return NextResponse.json(resultado, { status: statusErro });
}

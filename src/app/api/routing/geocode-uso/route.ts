/**
 * API Route — GET /api/routing/geocode-uso
 *
 * Devolve o uso do mês corrente da Google Geocoding API + o teto, pra UI da
 * captura mostrar "Google X/limite". Assim o motorista valida se a busca veio
 * do cache (contador não mexe) ou da API (sobe), e vê o quanto falta pro ViaCEP.
 *
 * Resposta: { mes, total, limite, restante }
 */

import { NextResponse } from 'next/server';
import { lerUsoMes } from '@/lib/routing/geocodeCache';

export async function GET(): Promise<NextResponse> {
  const uso = await lerUsoMes();
  return NextResponse.json(
    { ...uso, restante: Math.max(0, uso.limite - uso.total) },
    { status: 200 },
  );
}

/**
 * Cliente das rotas de API de roteirização (browser).
 *
 * Centraliza o padrao `fetch('/api/routing/rota/:id') → json → RotaResponse`
 * que estava copiado em rota/page.tsx (4x) e ajuste-rota/page.tsx (3x).
 */

import type { Parada, RotaOtimizada } from './types';

export interface RotaResponse {
  rota: RotaOtimizada;
  paradas: Parada[];
}

/**
 * Busca uma rota + suas paradas. LANCA em erro de rede ou HTTP nao-ok —
 * o caller decide se trata (offline → cache) ou ignora (refresh silencioso).
 *
 * @param opts.noStore evita o cache do browser (refresh ao voltar de outra tela)
 */
export async function fetchRota(rotaId: string, opts?: { noStore?: boolean }): Promise<RotaResponse> {
  const res = await fetch(
    `/api/routing/rota/${rotaId}`,
    opts?.noStore ? { cache: 'no-store' } : undefined
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RotaResponse;
}

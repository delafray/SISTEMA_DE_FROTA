/**
 * Guard de sessão para Route Handlers (/api/*).
 *
 * As rotas de API usam SUPABASE_SERVICE_ROLE_KEY (RLS off por decisão do
 * projeto), então SEM este guard qualquer pessoa na internet lê/escreve nos
 * dados. O guard exige a sessão Supabase do cookie (@supabase/ssr) — todos os
 * consumidores dessas rotas são páginas logadas no mesmo domínio.
 *
 * Fora do guard, de propósito:
 * - /api/lembretes* — regra do dono (05/06/2026): lembrete sem NENHUMA trava.
 * - /api/whatsapp/webhook — máquina (Evolution), valida secret próprio.
 * - /api/whatsapp/reconectar — já exige sessão + role master inline.
 * - /api/prints — workflow documentado do dono (Claude busca sem sessão).
 * - /api/{arquitetura,monitoring}/status — health checks, sem dado sensível.
 *
 * Offline (motorista): as ações ficam na fila local (Dexie) e só chegam aqui
 * quando o aparelho volta pra rede — momento em que o cookie refresca. Um 401
 * transitório é reenviado pelo backoff da fila (sync.ts / syncAcoes.ts).
 *
 * Uso:
 *   const { erro } = await requireSessao();
 *   if (erro) return erro;
 */

import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export type ResultadoSessao =
  | { user: User; erro: null }
  | { user: null; erro: NextResponse };

export async function requireSessao(): Promise<ResultadoSessao> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      erro: NextResponse.json({ error: 'nao_autenticado' }, { status: 401 }),
    };
  }
  return { user, erro: null };
}

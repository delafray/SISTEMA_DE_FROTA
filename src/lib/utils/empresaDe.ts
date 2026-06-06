import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deriva a empresa de um registro operacional a partir do ATIVO ao qual ele
 * pertence: custos/fretes herdam a empresa do CAMINHÃO; pagamentos herdam a do
 * MOTORISTA. O usuário não escolhe empresa nesses cadastros — sai automático.
 */
export async function empresaDoVeiculo(sb: SupabaseClient, veiculoId: string | null | undefined): Promise<string | null> {
  if (!veiculoId) return null;
  const { data } = await sb.from("veiculos").select("empresa_id").eq("id", veiculoId).maybeSingle();
  return data?.empresa_id ?? null;
}

export async function empresaDoMotorista(sb: SupabaseClient, motoristaId: string | null | undefined): Promise<string | null> {
  if (!motoristaId) return null;
  const { data } = await sb.from("motoristas").select("empresa_id").eq("id", motoristaId).maybeSingle();
  return data?.empresa_id ?? null;
}

/**
 * Empresas que o usuário logado (gestor) acessa, de usuario_empresas.
 * Retorna `null` quando NÃO há marcação → vê TODAS (sem trava, padrão do sistema).
 * Retorna a lista quando o gestor está restrito a empresas específicas.
 * Use pra filtrar fluxo de caixa / listas: `if (emps) q = q.in("empresa_id", emps)`.
 */
export async function empresasDoUsuario(sb: SupabaseClient): Promise<string[] | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from("usuario_empresas").select("empresa_id").eq("usuario_id", auth.user.id);
  const ids = (data ?? []).map((x) => x.empresa_id).filter((x): x is string => !!x);
  return ids.length ? ids : null; // vazio = todas
}

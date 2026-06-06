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

"use server";

import { createClient } from "@/lib/supabase/server";
import { salvarCadastro } from "@/lib/apis/apiCadastros";
import { revalidatePath } from "next/cache";

/** Só estes papéis veem/editam os cadastros sensíveis de /uso-apis. */
const ROLES_PERMITIDOS = ["admin", "master"];

export type SalvarCadastroState = { erro?: string; sucesso?: boolean };

/**
 * Salva o email + final do cartão de um serviço. Re-checa o papel no servidor
 * (admin/master) — não confia só no gate da página. Cifra via camada de dados.
 */
export async function salvarCadastroApiAction(
  _prev: SalvarCadastroState,
  formData: FormData
): Promise<SalvarCadastroState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };

  const { data: ue } = await supabase
    .from("usuario_empresas")
    .select("role")
    .eq("usuario_id", user.id)
    .eq("is_padrao", true)
    .single();

  if (!ue || !ROLES_PERMITIDOS.includes(ue.role)) {
    return { erro: "Sem permissão. Apenas admin/master." };
  }

  const apiId = (formData.get("apiId") as string) ?? "";
  const email = (formData.get("email") as string) ?? "";
  const cartaoFinal = (formData.get("cartaoFinal") as string) ?? "";
  const observacao = (formData.get("observacao") as string) ?? "";

  const r = await salvarCadastro({ apiId, email, cartaoFinal, observacao });
  if (!r.ok) return { erro: r.erro };

  revalidatePath("/uso-apis");
  return { sucesso: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function editarUsuarioAction(
  _state: { error?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: myUe } = await supabase
    .from("usuario_empresas").select("role, empresa_id")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();
  if (myUe?.role !== "master") return { error: "Sem permissão. Apenas masters podem editar usuários." };

  const usuarioId = formData.get("usuario_id") as string;
  const nome      = formData.get("nome") as string;
  const role      = formData.get("role") as string;

  if (nome?.trim()) {
    await supabase.from("perfis").update({ nome: nome.trim() }).eq("id", usuarioId);
  }

  await supabase.from("usuario_empresas")
    .update({ role })
    .eq("usuario_id", usuarioId)
    .eq("empresa_id", myUe.empresa_id);

  redirect("/usuarios");
}

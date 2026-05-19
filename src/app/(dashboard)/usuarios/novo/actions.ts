"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type CriarUsuarioState = {
  error?: string;
  success?: boolean;
};

export async function criarUsuarioAction(
  _prev: CriarUsuarioState,
  formData: FormData
): Promise<CriarUsuarioState> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: ue } = await supabase
    .from("usuario_empresas")
    .select("empresa_id, role")
    .eq("usuario_id", user.id)
    .eq("is_padrao", true)
    .single();

  if (!ue || ue.role !== "master") return { error: "Sem permissão" };

  const nome = formData.get("nome") as string;
  const username = formData.get("username") as string;
  const senha = formData.get("senha") as string;
  const role = formData.get("role") as "master" | "motorista";
  const motorista_id = (formData.get("motorista_id") as string) || null;

  // Normaliza username → email (igual ao login)
  const normalized = username
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const email = `${normalized}@frota.sys`;

  // Cria usuário no Auth com service role
  const { data: newUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (authError || !newUser.user) {
    return { error: authError?.message ?? "Erro ao criar usuário" };
  }

  // Vincula à empresa
  const { error: ueError } = await admin.from("usuario_empresas").insert({
    usuario_id: newUser.user.id,
    empresa_id: ue.empresa_id,
    role,
    is_padrao: true,
  });

  if (ueError) return { error: ueError.message };

  // Se motorista, vincula o perfil ao registro de motorista
  if (role === "motorista" && motorista_id) {
    await admin.from("perfis").update({ motorista_id }).eq("id", newUser.user.id);
  }

  redirect("/usuarios");
}

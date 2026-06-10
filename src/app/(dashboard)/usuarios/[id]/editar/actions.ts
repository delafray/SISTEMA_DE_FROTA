"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function editarUsuarioAction(
  _state: { error?: string } | undefined,
  formData: FormData
) {
  const supabase = await createClient();
  const admin = createAdminClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: myUe } = await supabase
    .from("usuario_empresas").select("role, empresa_id")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();
  if (myUe?.role !== "master") return { error: "Sem permissão. Apenas masters podem editar usuários." };

  const usuarioId    = formData.get("usuario_id") as string;
  const nome         = formData.get("nome") as string;
  const login        = formData.get("login") as string;
  const role         = formData.get("role") as string;
  const senha        = formData.get("senha") as string;
  const motorista_id = (formData.get("motorista_id") as string) || null;
  const beta_rota    = formData.get("beta_rota") === "on"; // 🧪 testador externo de rota

  // 1. Atualiza senha se fornecida
  if (senha && senha.length >= 6) {
    const { error: authError } = await admin.auth.admin.updateUserById(usuarioId, {
      password: senha,
    });
    if (authError) return { error: `Erro ao redefinir senha: ${authError.message}` };
  } else if (senha && senha.length < 6) {
    return { error: "A nova senha deve ter pelo menos 6 caracteres." };
  }

  // 2. Atualiza perfil (nome, login e motorista_id)
  if (nome?.trim()) {
    const targetMotorista = role === "motorista" ? motorista_id : null;
    const normalizedLogin = login
      ? login.toLowerCase().replace(/[^a-z0-9]/g, "")
      : nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

    await admin.from("perfis")
      .update({ 
        nome: nome.trim(),
        login: normalizedLogin,
        motorista_id: targetMotorista
      })
      .eq("id", usuarioId);
  }

  await admin.from("usuario_empresas")
    .update({ role })
    .eq("usuario_id", usuarioId)
    .eq("empresa_id", myUe.empresa_id);

  // 🧪 Beta teste rota (coluna da migration_beta_rota; falha silenciosa sem ela)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("perfis")
    .update({ beta_rota: role === "motorista" ? beta_rota : false })
    .eq("id", usuarioId);

  redirect("/usuarios");
}

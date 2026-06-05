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

  const ROLES_ADMIN = ["master", "admin", "gestor"];
  if (!ue || !ROLES_ADMIN.includes(ue.role))
    return { error: "Sem permissão — apenas admin/gestor podem criar usuários" };

  const nome         = formData.get("nome")         as string;
  const username     = formData.get("username")     as string;
  const senha        = formData.get("senha")        as string;
  const role         = formData.get("role")         as "master" | "gestor" | "motorista";
  const motorista_id = (formData.get("motorista_id") as string) || null;

  // Validações robustas no lado do servidor
  if (!nome || nome.trim().length < 2) {
    return { error: "Nome completo é obrigatório e deve ter pelo menos 2 caracteres." };
  }
  if (!username || username.trim().length < 3) {
    return { error: "Nome de usuário é obrigatório e deve ter pelo menos 3 caracteres." };
  }
  if (/\s/.test(username)) {
    return { error: "Nome de usuário não pode conter espaços." };
  }
  if (!senha || senha.length < 6) {
    return { error: "Senha provisória deve conter pelo menos 6 caracteres." };
  }
  if (!["master", "gestor", "motorista"].includes(role)) {
    return { error: "Perfil/Role selecionado é inválido." };
  }

  // Normaliza username → email (igual ao login)
  const normalized = username
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const email = `${normalized}@frota.sys`;

  // ── Tenta criar; se já existir, recupera o registro incompleto ──────────
  let targetUserId: string;

  const { data: newUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (authError) {
    // Usuário já existe no Auth (cadastro incompleto anterior) → recupera
    const isAlreadyExists =
      authError.message.toLowerCase().includes("already") ||
      authError.message.toLowerCase().includes("registered") ||
      (authError as { code?: string }).code === "email_exists";

    if (!isAlreadyExists) return { error: authError.message };

    // Busca o usuário pelo email
    const { data: listData, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return { error: `Erro ao buscar usuário: ${listError.message}` };

    const existing = listData.users.find((u) => u.email === email);
    if (!existing)
      return { error: "Usuário já existe mas não foi encontrado. Contate o suporte." };

    // BUGFIX: se esse login JÁ está vinculado a esta empresa, é login duplicado.
    // NÃO sobrescrever o usuário existente (era isso que fazia os cadastros "sumirem":
    // cada novo cadastro com login repetido recuperava e regravava o mesmo usuário).
    const { data: jaVinculado } = await admin
      .from("usuario_empresas")
      .select("id")
      .eq("usuario_id", existing.id)
      .eq("empresa_id", ue.empresa_id)
      .maybeSingle();
    if (jaVinculado)
      return { error: `Já existe um usuário com o login "${normalized}". Escolha outro nome de usuário (ou edite o usuário existente).` };

    // Caso contrário é um usuário órfão (Auth sem vínculo) → completa o cadastro.
    targetUserId = existing.id;
    await admin.auth.admin.updateUserById(targetUserId, {
      password: senha,
      user_metadata: { nome },
    });
  } else {
    if (!newUser.user) return { error: "Erro inesperado ao criar usuário" };
    targetUserId = newUser.user.id;
  }

  // ── Vincula à empresa (ignora duplicata) ────────────────────────────────
  const { error: ueError } = await admin.from("usuario_empresas").insert({
    usuario_id: targetUserId,
    empresa_id: ue.empresa_id,
    role,
    is_padrao: true,
  });

  if (ueError && ueError.code !== "23505") {
    return { error: ueError.message };
  }

  // ── Garante linha em perfis para TODOS os usuarios (inner join da lista depende disso) ──
  await admin.from("perfis")
    .insert({ id: targetUserId, nome, login: normalized })
    .select()
    .maybeSingle();
  // Atualiza nome e login caso a linha já existisse
  await admin.from("perfis")
    .update({ nome, login: normalized })
    .eq("id", targetUserId);

  // ── Vincula perfil ao motorista (apenas se role = motorista) ────────────
  if (role === "motorista" && motorista_id) {
    await admin.from("perfis")
      .update({ motorista_id })
      .eq("id", targetUserId);
  }

  redirect("/usuarios");
}

export async function removerUsuarioAction(usuarioId: string, empresaId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: myUe } = await supabase
    .from("usuario_empresas").select("role, empresa_id")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();
  
  if (myUe?.role !== "master") return { error: "Sem permissão. Apenas masters podem remover usuários." };
  if (myUe.empresa_id !== empresaId) return { error: "Empresa inválida." };
  if (user.id === usuarioId) return { error: "Não é possível remover a si mesmo." };

  // Remove da empresa
  const { error } = await admin
    .from("usuario_empresas")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("empresa_id", empresaId);

  if (error) return { error: error.message };

  // Verifica se o usuário pertence a alguma outra empresa
  const { data: otherCompanies } = await admin
    .from("usuario_empresas")
    .select("empresa_id")
    .eq("usuario_id", usuarioId);

  if (!otherCompanies || otherCompanies.length === 0) {
    await admin.auth.admin.deleteUser(usuarioId);
    // Também limpa perfis
    await admin.from("perfis").delete().eq("id", usuarioId);
  }

  return { success: true };
}

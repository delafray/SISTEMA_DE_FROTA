import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState } from "@/components/ui/ds";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: ue } = await supabase
    .from("usuario_empresas")
    .select("empresa_id")
    .eq("usuario_id", user.id)
    .eq("is_padrao", true)
    .single();

  const { data: usuarios } = await supabase
    .from("usuario_empresas")
    .select("role, is_padrao, usuario_id, perfis(nome), empresa_id")
    .eq("empresa_id", ue?.empresa_id ?? "")
    .order("role");

  const roleLabel: Record<string, string> = {
    master: "Master",
    gestor: "Gestor",
    motorista: "Motorista",
  };
  const roleVar: Record<string, "purple" | "info" | "success" | "default"> = {
    master: "purple",
    gestor: "info",
    motorista: "success",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Usuários" count={usuarios?.length}>
        <Btn href="/usuarios/novo" size="sm">+ Novo Usuário</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <DataTable count={usuarios?.length ?? 0} label="usuários">
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Usuário (Login)</Th>
              <Th>Role</Th>
              <Th>Padrão</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!usuarios || usuarios.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    message="Nenhum usuário cadastrado."
                    icon="👥"
                    action={<Btn href="/usuarios/novo">+ Cadastrar primeiro usuário</Btn>}
                  />
                </td>
              </tr>
            ) : (
              usuarios.map(u => {
                const perfil = Array.isArray(u.perfis) ? u.perfis[0] : u.perfis;
                const isMe = u.usuario_id === user.id;
                return (
                  <Tr key={u.usuario_id}>
                    <Td>
                      {perfil?.nome ?? "—"}
                      {isMe && (
                        <Badge variant="default"> VOCÊ</Badge>
                      )}
                    </Td>
                    <Td>
                      {perfil?.nome
                        ? perfil.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
                        : "—"}
                    </Td>
                    <Td>
                      <Badge variant={roleVar[u.role] ?? "default"}>
                        {roleLabel[u.role] ?? u.role}
                      </Badge>
                    </Td>
                    <Td>
                      {u.is_padrao
                        ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✓</span>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {!isMe && (
                        <a href={`/usuarios/${u.usuario_id}/editar`} style={{ color: "#2563eb", textDecoration: "none" }}>
                          Editar
                        </a>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

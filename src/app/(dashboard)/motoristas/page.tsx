import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState } from "@/components/ui/ds";

export const dynamic = "force-dynamic";

export default async function MotoristasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: motoristas } = await supabase
    .from("motoristas")
    .select("*")
    .order("nome");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Motoristas" subtitle="Gerencie os motoristas da frota" count={motoristas?.length}>
        <Btn href="/motoristas/novo" size="sm">+ Cadastrar Motorista</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <DataTable count={motoristas?.length ?? 0} label="motoristas">
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>CPF</Th>
              <Th>CNH</Th>
              <Th>Cat. CNH</Th>
              <Th>Vencimento CNH</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!motoristas || motoristas.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message="Nenhum motorista cadastrado."
                    icon="👤"
                    action={<Btn href="/motoristas/novo">+ Cadastrar primeiro motorista</Btn>}
                  />
                </td>
              </tr>
            ) : (
              motoristas.map(m => {
                const cnhDate = m.cnh_validade ? new Date(m.cnh_validade + "T00:00:00") : null;
                const diasCnh = cnhDate ? Math.ceil((cnhDate.getTime() - Date.now()) / 86400000) : null;
                const cnhVar  = diasCnh === null ? "default" : diasCnh < 0 ? "danger" : diasCnh < 30 ? "warning" : "success";

                return (
                  <Tr key={m.id}>
                    <Td>{m.nome}</Td>
                    <Td>{m.cpf}</Td>
                    <Td>{m.cnh_numero ?? "—"}</Td>
                    <Td>{m.cnh_categoria ?? "—"}</Td>
                    <Td>
                      {cnhDate
                        ? <Badge variant={cnhVar}>{cnhDate.toLocaleDateString("pt-BR")}</Badge>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td><Badge variant={m.ativo ? "success" : "default"}>{m.ativo ? "ATIVO" : "INATIVO"}</Badge></Td>
                    <Td style={{ textAlign: "right" }}>
                      <a href={`/motoristas/${m.id}/editar`} style={{ color: "#2563eb", textDecoration: "none" }}>
                        Editar
                      </a>
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

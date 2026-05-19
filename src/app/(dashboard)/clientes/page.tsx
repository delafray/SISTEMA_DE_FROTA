import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState } from "@/components/ui/ds";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("*")
    .order("nome_fantasia");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Clientes" subtitle="Gerencie seus clientes e embarcadores" count={clientes?.length}>
        <Btn href="/clientes/novo" size="sm">+ Cadastrar Cliente</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <DataTable count={clientes?.length ?? 0} label="clientes">
          <thead>
            <tr>
              <Th>Nome Fantasia</Th>
              <Th>Razão Social</Th>
              <Th>CNPJ/CPF</Th>
              <Th>Cidade</Th>
              <Th>UF</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!clientes || clientes.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message="Nenhum cliente cadastrado."
                    icon="🏭"
                    action={<Btn href="/clientes/novo">+ Cadastrar primeiro cliente</Btn>}
                  />
                </td>
              </tr>
            ) : (
              clientes.map(c => (
                <Tr key={c.id}>
                  <Td>{c.nome_fantasia}</Td>
                  <Td>{c.razao_social ?? "—"}</Td>
                  <Td>{c.documento ?? "—"}</Td>
                  <Td>{c.cidade ?? "—"}</Td>
                  <Td>{c.uf ?? "—"}</Td>
                  <Td><Badge variant={c.ativo !== false ? "success" : "default"}>{c.ativo !== false ? "Ativo" : "Inativo"}</Badge></Td>
                  <Td style={{ textAlign: "right" }}>
                    <a href={`/clientes/${c.id}/editar`} style={{ color: "#2563eb", textDecoration: "none" }}>
                      Editar
                    </a>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState } from "@/components/ui/ds";

export default async function EmpresasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ue } = await supabase
    .from("usuario_empresas")
    .select("empresa_id")
    .eq("usuario_id", user.id)
    .eq("is_padrao", true)
    .single();

  const { data: empresas } = await supabase
    .from("empresas")
    .select("*")
    .order("nome_fantasia");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Empresas" count={empresas?.length}>
        <Btn href="/empresas/novo" size="sm">+ Nova Empresa</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <DataTable count={empresas?.length ?? 0} label="empresas">
          <thead>
            <tr>
              <Th>Nome Fantasia</Th>
              <Th>CNPJ</Th>
              <Th>Cidade</Th>
              <Th>UF</Th>
              <Th>Telefone</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!empresas || empresas.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    message="Nenhuma empresa cadastrada."
                    icon="🏢"
                    action={<Btn href="/empresas/novo">+ Cadastrar primeira empresa</Btn>}
                  />
                </td>
              </tr>
            ) : (
              empresas.map(e => (
                <Tr key={e.id}>
                  <Td>
                    {e.nome_fantasia}
                    {e.id === ue?.empresa_id && (
                      <Badge variant="info"> ATUAL</Badge>
                    )}
                  </Td>
                  <Td>
                    {e.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                  </Td>
                  <Td>{e.cidade ?? "—"}</Td>
                  <Td>{e.uf ?? "—"}</Td>
                  <Td>{e.telefone ?? "—"}</Td>
                  <Td style={{ textAlign: "right" }}>
                    <a
                      href={`/empresas/${e.id}/editar`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
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

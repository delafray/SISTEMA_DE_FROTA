import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, ActionBtn, KpiCard, EmptyState } from "@/components/ui/ds";

export const dynamic = "force-dynamic";

export default async function VeiculosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: ue } = await supabase
    .from("usuario_empresas").select("empresa_id")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();

  const { data: veiculos } = await supabase
    .from("veiculos").select("*")
    .eq("empresa_id", ue?.empresa_id ?? "")
    .order("placa");

  const ativos   = veiculos?.filter(v => v.ativo).length ?? 0;
  const inativos = veiculos?.filter(v => !v.ativo).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Veículos" count={veiculos?.length}>
        <Btn href="/veiculos/novo" size="sm">+ Cadastrar Veículo</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Total"       value={veiculos?.length ?? 0} />
          <KpiCard label="Ativos"      value={ativos}               color="success" />
          <KpiCard label="Inativos"    value={inativos}             color="danger" />
          <KpiCard label="Em viagem"   value={0}                    color="info" />
        </div>

        {/* Tabela */}
        <DataTable count={veiculos?.length ?? 0} label="veículos">
          <thead>
            <tr>
              <Th>Placa</Th>
              <Th>Apelido</Th>
              <Th>Marca / Modelo</Th>
              <Th>Tipo</Th>
              <Th>Combustível</Th>
              <Th>Ano</Th>
              <Th style={{ textAlign: "right" }}>KM Atual</Th>
              <Th>Venc. IPVA</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!veiculos || veiculos.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    message="Nenhum veículo cadastrado."
                    icon="🚛"
                    action={<Btn href="/veiculos/novo">+ Cadastrar primeiro veículo</Btn>}
                  />
                </td>
              </tr>
            ) : (
              veiculos.map(v => {
                const ipvaDate = v.ipva_vencimento ? new Date(v.ipva_vencimento + "T00:00:00") : null;
                const hoje     = new Date();
                const diasIpva = ipvaDate ? Math.ceil((ipvaDate.getTime() - hoje.getTime()) / 86400000) : null;
                const ipvaVar  = diasIpva === null ? "default" : diasIpva < 0 ? "danger" : diasIpva < 30 ? "warning" : "success";

                return (
                  <Tr key={v.id} muted={!v.ativo}>
                    <Td>{v.placa}</Td>
                    <Td>{v.apelido ?? "—"}</Td>
                    <Td>
                      <span>{v.marca}</span>
                      <span> {v.modelo}</span>
                    </Td>
                    <Td style={{ textTransform: "capitalize" }}>
                      {v.tipo}
                      {v.categoria && <span>/ {v.categoria}</span>}
                    </Td>
                    <Td style={{ textTransform: "capitalize" }}>{v.combustivel?.replace("_", " ")}</Td>
                    <Td>{v.ano}</Td>
                    <Td style={{ textAlign: "right" }}>{v.km_atual?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td>
                      {v.ipva_vencimento
                        ? <Badge variant={ipvaVar}>{new Date(v.ipva_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</Badge>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td><Badge variant={v.ativo ? "success" : "default"}>{v.ativo ? "Ativo" : "Inativo"}</Badge></Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <a href={`/veiculos/${v.id}`} style={{ color: "#64748b", textDecoration: "none" }}>Ver</a>
                        <a href={`/veiculos/${v.id}/editar`} style={{ color: "#2563eb", textDecoration: "none" }}>Editar</a>
                      </div>
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

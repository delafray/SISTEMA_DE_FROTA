import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState } from "@/components/ui/ds";

export const dynamic = "force-dynamic";

export default async function FretesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();

  const { data: fretes } = await supabase
    .from("fretes")
    .select(`
      id, status, origem, destino, valor_frete, km_inicial, km_total,
      data_coleta_prevista, data_inicio, data_fim, created_at,
      veiculos(placa, modelo),
      motoristas(nome)
    `)
    .eq("empresa_id", ue?.empresa_id ?? "")
    .order("created_at", { ascending: false });

  const totais = {
    agendado:     fretes?.filter(f => f.status === "agendado").length ?? 0,
    em_andamento: fretes?.filter(f => f.status === "em_andamento").length ?? 0,
    concluido:    fretes?.filter(f => f.status === "concluido").length ?? 0,
    receita:      fretes?.filter(f => f.status === "concluido").reduce((s, f) => s + (f.valor_frete ?? 0), 0) ?? 0,
  };

  const statusVar: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
    agendado: "warning",
    em_andamento: "info",
    concluido: "success",
    cancelado: "danger",
  };
  const statusLabel: Record<string, string> = {
    agendado: "Agendado",
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Fretes / Viagens" count={fretes?.length}>
        <Btn href="/fretes/novo" size="sm">+ Novo Frete</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Agendados"    value={totais.agendado}     color="warning" />
          <KpiCard label="Em Andamento" value={totais.em_andamento} color="info" />
          <KpiCard label="Concluídos"   value={totais.concluido}    color="success" />
          <KpiCard
            label="Receita Concluída"
            value={`R$ ${totais.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            color="success"
          />
        </div>

        {/* Tabela */}
        <DataTable count={fretes?.length ?? 0} label="fretes">
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Rota</Th>
              <Th>Veículo</Th>
              <Th>Motorista</Th>
              <Th>Coleta</Th>
              <Th style={{ textAlign: "right" }}>Valor (R$)</Th>
              <Th style={{ textAlign: "right" }}>KM</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {!fretes || fretes.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    message="Nenhum frete cadastrado."
                    icon="📦"
                    action={<Btn href="/fretes/novo">+ Criar primeiro frete</Btn>}
                  />
                </td>
              </tr>
            ) : (
              fretes.map(frete => {
                const veiculo   = Array.isArray(frete.veiculos) ? frete.veiculos[0] : frete.veiculos;
                const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
                return (
                  <Tr key={frete.id}>
                    <Td>
                      <Badge variant={statusVar[frete.status] ?? "default"}>
                        {statusLabel[frete.status] ?? frete.status}
                      </Badge>
                    </Td>
                    <Td>
                      {frete.origem}
                      <span style={{ color: "#94a3b8", fontSize: "10px", marginLeft: "4px" }}>→ {frete.destino}</span>
                    </Td>
                    <Td>
                      {veiculo?.placa ?? "—"}
                      {veiculo?.modelo && <span style={{ color: "#94a3b8", fontSize: "10px", marginLeft: "4px" }}>({veiculo.modelo})</span>}
                    </Td>
                    <Td>{motorista?.nome ?? "—"}</Td>
                    <Td>
                      {frete.data_coleta_prevista
                        ? new Date(frete.data_coleta_prevista + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {frete.valor_frete
                        ? frete.valor_frete.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                        : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {frete.km_total?.toLocaleString("pt-BR") ?? "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <a href={`/fretes/${frete.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                        Ver
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

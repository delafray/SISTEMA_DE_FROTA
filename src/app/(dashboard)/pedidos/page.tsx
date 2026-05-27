"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn,
  KpiCard, EmptyState, SearchInput, selectStyle,
} from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Pedido = {
  id: string;
  status: string;
  valor_pedido: number | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  km_inicial: number | null;
  km_final: number | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; modelo: string; marca: string } | null;
  entregas: { id: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendado", agendado: "Agendado",
  em_andamento: "Em Andamento",
  concluida: "Concluído", concluido: "Concluído",
  cancelada: "Cancelado", cancelado: "Cancelado",
};
const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", agendado: "warning",
  em_andamento: "info",
  concluida: "success", concluido: "success",
  cancelada: "danger", cancelado: "danger",
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function PedidosListPage() {
  const router = useRouter();
  const [todas, setTodas]     = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [filtro, setFiltro]   = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Pedido>((from, to) =>
        supabase.from("pedidos")
          .select("id,status,valor_pedido,data_inicio_prevista,data_fim_prevista,km_inicial,km_final,motoristas(nome),veiculos(placa,modelo,marca),entregas(id)")
          .eq("empresa_id", ue.empresa_id)
          .order("data_inicio_prevista", { ascending: false })
          .range(from, to)
      );
      setTodas(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = useMemo(() => {
    const hay = normalizar(buscaDeferred);
    return todas.filter(v => {
      if (filtro && v.status !== filtro) return false;
      if (!hay) return true;
      const motorista = Array.isArray(v.motoristas) ? v.motoristas[0] : v.motoristas;
      const veiculo   = Array.isArray(v.veiculos)   ? v.veiculos[0]   : v.veiculos;
      return (
        normalizar(motorista?.nome ?? "").includes(hay) ||
        normalizar(veiculo?.placa ?? "").includes(hay) ||
        normalizar(veiculo?.modelo ?? "").includes(hay)
      );
    });
  }, [todas, buscaDeferred, filtro]);

  const kpis = useMemo(() => ({
    total:       todas.length,
    agendadas:   todas.filter(v => v.status === "agendada" || v.status === "agendado").length,
    andamento:   todas.filter(v => v.status === "em_andamento").length,
    concluidas:  todas.filter(v => v.status === "concluida" || v.status === "concluido").length,
  }), [todas]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Pedidos"
        count={filtradas.length}
        actions={<Btn href="/pedidos/novo">+ Novo Pedido</Btn>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <KpiCard label="Total"       value={kpis.total}      />
          <KpiCard label="Agendados"   value={kpis.agendadas}  color="warning" />
          <KpiCard label="Em Andamento" value={kpis.andamento} color="info" />
          <KpiCard label="Concluídos"  value={kpis.concluidas} color="success" />
        </div>

        <div className="m-hide">
        <DataTable
          toolbar={
            <>
              <SearchInput
                placeholder="Buscar motorista, placa..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...selectStyle, width: "160px" }}>
                <option value="">Todos os status</option>
                <option value="agendado">Agendado</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </>
          }
        >
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Motorista</Th>
              <Th>Veículo</Th>
              <Th>Início Previsto</Th>
              <Th>Fim Previsto</Th>
              <Th>Entregas</Th>
              <Th>Valor (R$)</Th>
              <Th>KM</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={9} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>Carregando...</Td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={9}><EmptyState message="Nenhum pedido encontrado" action={<Btn href="/pedidos/novo">Criar primeiro pedido</Btn>} /></td></tr>
            ) : filtradas.map(v => {
              const motorista = Array.isArray(v.motoristas) ? v.motoristas[0] : v.motoristas;
              const veiculo   = Array.isArray(v.veiculos)   ? v.veiculos[0]   : v.veiculos;
              const entregas  = Array.isArray(v.entregas)   ? v.entregas      : [];
              const kmRodado  = v.km_final != null && v.km_inicial != null ? v.km_final - v.km_inicial : null;
              return (
                <Tr key={v.id}>
                  <Td><Badge variant={STATUS_VAR[v.status] ?? "default"}>{STATUS_LABEL[v.status] ?? v.status}</Badge></Td>
                  <Td style={{ fontWeight: 600 }}>{motorista?.nome ?? "—"}</Td>
                  <Td>{veiculo ? `${veiculo.placa} · ${veiculo.marca} ${veiculo.modelo}` : "—"}</Td>
                  <Td>{fmtDate(v.data_inicio_prevista)}</Td>
                  <Td>{fmtDate(v.data_fim_prevista)}</Td>
                  <Td style={{ textAlign: "center" }}>
                    <Badge variant={entregas.length > 0 ? "info" : "default"}>{entregas.length}</Badge>
                  </Td>
                  <Td style={{ textAlign: "right" }}>{v.valor_pedido ? v.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}</Td>
                  <Td>{kmRodado != null ? `${kmRodado.toLocaleString("pt-BR")} km` : "—"}</Td>
                  <Td>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                      <Btn href={`/pedidos/${v.id}`}      variant="ghost" size="xs">Ver</Btn>
                      <Btn href={`/pedidos/${v.id}/editar`} variant="outline" size="xs">Editar</Btn>
                      <DeleteBtn id={v.id} table="pedidos" label="pedido" />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
        </div>

        <MobileList count={filtradas.length} label="pedidos">
          {loading ? null : filtradas.map(v => {
            const motorista = Array.isArray(v.motoristas) ? v.motoristas[0] : v.motoristas;
            const veiculo   = Array.isArray(v.veiculos)   ? v.veiculos[0]   : v.veiculos;
            const entregas  = Array.isArray(v.entregas)   ? v.entregas      : [];
            const concluido = v.status === "concluida" || v.status === "concluido";
            const cancelado = v.status === "cancelada" || v.status === "cancelado";
            const statusColor = concluido ? "#16a34a" : v.status === "em_andamento" ? "#2563eb" : cancelado ? "#ef4444" : "#eab308";
            return (
              <MobileCard
                key={v.id}
                href={`/pedidos/${v.id}`}
                title={motorista?.nome ?? "Sem motorista"}
                subtitle={veiculo ? `${veiculo.placa} • ${veiculo.marca} ${veiculo.modelo}` : "Sem veículo"}
                badge={<Badge variant={STATUS_VAR[v.status] ?? "default"}>{STATUS_LABEL[v.status] ?? v.status}</Badge>}
                highlight={statusColor}
                details={[
                  { label: "Início", value: fmtDate(v.data_inicio_prevista) },
                  { label: "Fim", value: fmtDate(v.data_fim_prevista) },
                  { label: "Entregas", value: String(entregas.length) },
                  { label: "Valor", value: v.valor_pedido ? `R$ ${v.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/pedidos/novo" label="Novo Pedido" />
      </div>
    </div>
  );
}

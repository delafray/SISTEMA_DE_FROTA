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

type Viagem = {
  id: string;
  status: string;
  data_saida_prevista: string | null;
  data_chegada_prevista: string | null;
  km_inicial: number | null;
  km_final: number | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; modelo: string; marca: string } | null;
  fretes: { id: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada", em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", em_andamento: "info", concluida: "success", cancelada: "danger",
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function ViagensPage() {
  const router = useRouter();
  const [todas, setTodas]     = useState<Viagem[]>([]);
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

      const data = await loadAll<Viagem>((from, to) =>
        (supabase as any).from("viagens")
          .select("id,status,data_saida_prevista,data_chegada_prevista,km_inicial,km_final,motoristas(nome),veiculos(placa,modelo,marca),fretes(id)")
          .eq("empresa_id", ue.empresa_id)
          .order("data_saida_prevista", { ascending: false })
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
    agendadas:   todas.filter(v => v.status === "agendada").length,
    andamento:   todas.filter(v => v.status === "em_andamento").length,
    concluidas:  todas.filter(v => v.status === "concluida").length,
  }), [todas]);

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    // Desvincular fretes antes de deletar
    await (supabase as any).from("fretes").update({ viagem_id: null }).eq("viagem_id", id);
    await (supabase as any).from("viagens").delete().eq("id", id);
    setTodas(p => p.filter(v => v.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Viagens"
        count={filtradas.length}
        actions={<Btn href="/viagens/novo">+ Nova Viagem</Btn>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <KpiCard label="Total"       value={kpis.total}      />
          <KpiCard label="Agendadas"   value={kpis.agendadas}  color="warning" />
          <KpiCard label="Em Andamento" value={kpis.andamento} color="info" />
          <KpiCard label="Concluídas"  value={kpis.concluidas} color="success" />
        </div>

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
                <option value="agendada">Agendada</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </>
          }
        >
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Motorista</Th>
              <Th>Veículo</Th>
              <Th>Saída Prevista</Th>
              <Th>Chegada Prevista</Th>
              <Th>Fretes</Th>
              <Th>KM</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>Carregando...</Td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={8}><EmptyState message="Nenhuma viagem encontrada" action={<Btn href="/viagens/novo">Criar primeira viagem</Btn>} /></td></tr>
            ) : filtradas.map(v => {
              const motorista = Array.isArray(v.motoristas) ? v.motoristas[0] : v.motoristas;
              const veiculo   = Array.isArray(v.veiculos)   ? v.veiculos[0]   : v.veiculos;
              const fretes    = Array.isArray(v.fretes)     ? v.fretes        : [];
              const kmRodado  = v.km_final != null && v.km_inicial != null ? v.km_final - v.km_inicial : null;
              return (
                <Tr key={v.id}>
                  <Td><Badge variant={STATUS_VAR[v.status] ?? "default"}>{STATUS_LABEL[v.status] ?? v.status}</Badge></Td>
                  <Td style={{ fontWeight: 600 }}>{motorista?.nome ?? "—"}</Td>
                  <Td>{veiculo ? `${veiculo.placa} · ${veiculo.marca} ${veiculo.modelo}` : "—"}</Td>
                  <Td>{fmtDate(v.data_saida_prevista)}</Td>
                  <Td>{fmtDate(v.data_chegada_prevista)}</Td>
                  <Td style={{ textAlign: "center" }}>
                    <Badge variant={fretes.length > 0 ? "info" : "default"}>{fretes.length}</Badge>
                  </Td>
                  <Td>{kmRodado != null ? `${kmRodado.toLocaleString("pt-BR")} km` : "—"}</Td>
                  <Td>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                      <Btn href={`/viagens/${v.id}`}      variant="ghost" size="xs">Ver</Btn>
                      <Btn href={`/viagens/${v.id}/editar`} variant="outline" size="xs">Editar</Btn>
                      <DeleteBtn id={v.id} table="viagens" label="viagem" />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}

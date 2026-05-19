"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";

type Frete = {
  id: string; status: string; origem: string; destino: string;
  valor_frete: number | null; km_inicial: number | null; km_total: number | null;
  data_coleta_prevista: string | null; tipo_carga: string | null;
  veiculos: { placa: string; modelo: string } | null;
  motoristas: { nome: string } | null;
};

const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};

export default function FretesPage() {
  const router = useRouter();
  const [todos, setTodos]     = useState<Frete[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Frete>((from, to) =>
        supabase.from("fretes")
          .select("id,status,origem,destino,valor_frete,km_inicial,km_total,data_coleta_prevista,tipo_carga,veiculos(placa,modelo),motoristas(nome)")
          .eq("empresa_id", ue.empresa_id).order("created_at", { ascending: false }).range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of todos) {
      const veiculo   = Array.isArray(f.veiculos) ? f.veiculos[0] : f.veiculos;
      const motorista = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
      m.set(f.id, normalizar([
        f.origem, f.destino, f.tipo_carga,
        veiculo?.placa, veiculo?.modelo, motorista?.nome,
      ].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(f => {
      if (filtroStatus && f.status !== filtroStatus) return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(f.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroStatus]);

  const totais = useMemo(() => ({
    agendado:     todos.filter(f => f.status === "agendado").length,
    em_andamento: todos.filter(f => f.status === "em_andamento").length,
    concluido:    todos.filter(f => f.status === "concluido").length,
    receita:      todos.filter(f => f.status === "concluido").reduce((s, f) => s + (f.valor_frete ?? 0), 0),
  }), [todos]);

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por rota, veículo, motorista, carga..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        style={{ ...selectStyle, width: "160px" }}>
        <option value="">Todos os status</option>
        <option value="agendado">Agendado</option>
        <option value="em_andamento">Em Andamento</option>
        <option value="concluido">Concluído</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} fretes
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Fretes / Viagens" count={loading ? undefined : todos.length}>
        <Btn href="/fretes/novo" size="sm">+ Novo Frete</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Agendados"      value={loading ? "..." : totais.agendado}     color="warning" />
          <KpiCard label="Em Andamento"   value={loading ? "..." : totais.em_andamento} color="info" />
          <KpiCard label="Concluídos"     value={loading ? "..." : totais.concluido}    color="success" />
          <KpiCard
            label="Receita Concluída"
            value={loading ? "..." : `R$ ${totais.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            color="success"
          />
        </div>

        <DataTable count={filtrados.length} label="fretes" toolbar={toolbar}>
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
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum frete cadastrado." icon="📦" action={<Btn href="/fretes/novo">+ Criar primeiro frete</Btn>} />
                    : <EmptyState message="Nenhum frete encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              filtrados.map(frete => {
                const veiculo   = Array.isArray(frete.veiculos) ? frete.veiculos[0] : frete.veiculos;
                const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
                return (
                  <Tr key={frete.id}>
                    <Td>
                      <Badge variant={STATUS_VAR[frete.status] ?? "default"}>
                        {STATUS_LABEL[frete.status] ?? frete.status}
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
                    <Td style={{ textAlign: "right" }}>{frete.km_total?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/fretes/${frete.id}`} style={{ color: "#64748b", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Ver</a>
                        <a href={`/fretes/${frete.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={frete.id} table="fretes" label="frete" />
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

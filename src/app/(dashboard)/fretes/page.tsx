"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle, inputStyle, useTableSort } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Frete = {
  id: string; status: string; origem: string; destino: string;
  valor_frete: number | null; km_inicial: number | null; km_total: number | null;
  data_coleta_prevista: string | null; tipo_carga: string | null;
  pago: boolean | null; data_pagamento: string | null;
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
          .select("id,status,origem,destino,valor_frete,km_inicial,km_total,data_coleta_prevista,tipo_carga,pago,data_pagamento,veiculos(placa,modelo),motoristas(nome)")
          .eq("empresa_id", ue.empresa_id).order("created_at", { ascending: false }).range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarcarPago = async (id: string) => {
    try {
      const supabase = createClient();
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      const { error } = await supabase
        .from("fretes")
        .update({ pago: true, data_pagamento: today })
        .eq("id", id);
      if (error) {
        alert("Erro ao salvar pagamento: " + error.message);
      } else {
        setTodos(prev => prev.map(f => f.id === id ? { ...f, pago: true } : f));
      }
    } catch (err: any) {
      alert("Erro inesperado: " + err.message);
    }
  };

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

  const [mostrarPagos, setMostrarPagos] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState("mes_atual");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);

    const now = new Date();
    const currentYearStr = String(now.getFullYear());
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, "0");
    const currentYm = `${currentYearStr}-${currentMonthStr}`;

    return todos.filter(f => {
      if (filtroStatus && f.status !== filtroStatus) return false;

      // Se mostrarPagos for falso (padrão), removemos concluídos que JÁ estão pagos
      if (!mostrarPagos) {
        if (f.status === "concluido" && f.pago === true) return false;
      } else {
        // Se mostrarPagos for verdadeiro, exibimos APENAS concluídos pagos
        if (!(f.status === "concluido" && f.pago === true)) return false;

        // E aplicamos o filtro de período de pagamento
        const dateToCompare = f.data_pagamento || f.data_coleta_prevista;
        if (filtroPeriodo === "mes_atual") {
          if (!dateToCompare || !dateToCompare.startsWith(currentYm)) return false;
        } else if (filtroPeriodo === "ano_atual") {
          if (!dateToCompare || !dateToCompare.startsWith(currentYearStr)) return false;
        } else if (filtroPeriodo === "personalizado") {
          if (!dateToCompare) return false;
          if (dataInicio && dateToCompare < dataInicio) return false;
          if (dataFim && dateToCompare > dataFim) return false;
        }
      }

      if (palavras.length === 0) return true;
      const h = haystack.get(f.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim]);

  const totais = useMemo(() => {
    const concluidos = todos.filter(f => f.status === "concluido");
    return {
      agendado:          todos.filter(f => f.status === "agendado").length,
      em_andamento:      todos.filter(f => f.status === "em_andamento").length,
      concluido:         concluidos.length,
      concluidoPago:      concluidos.filter(f => f.pago === true).length,
      concluidoPendente:  concluidos.filter(f => f.pago !== true).length,
      receita:           concluidos.reduce((s, f) => s + (f.valor_frete ?? 0), 0),
      receitaPaga:       concluidos.filter(f => f.pago === true).reduce((s, f) => s + (f.valor_frete ?? 0), 0),
      receitaPendente:   concluidos.filter(f => f.pago !== true).reduce((s, f) => s + (f.valor_frete ?? 0), 0),
    };
  }, [todos]);

  const receitaExibida = useMemo(() => {
    return filtrados.reduce((s, f) => s + (f.valor_frete ?? 0), 0);
  }, [filtrados]);

  const { sortedData: ordenados, sortKey, sortDirection, handleSort } = useTableSort(filtrados, "status", "asc");

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
      <SearchInput
        placeholder="Buscar por rota, veículo, motorista, carga..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        style={{ ...selectStyle, width: "160px" }}
        disabled={mostrarPagos}
      >
        <option value="">Todos os status</option>
        <option value="agendado">Agendado</option>
        <option value="em_andamento">Em Andamento</option>
        <option value="concluido">Concluído</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <Btn
        variant={mostrarPagos ? "primary" : "outline"}
        onClick={() => {
          setMostrarPagos(!mostrarPagos);
          if (!mostrarPagos) setFiltroStatus(""); // Limpa filtro de status ao ver pagos
        }}
      >
        {mostrarPagos ? "↩ Ver Ativos / Pendentes" : "💰 Ver Concluídos Pagos"}
      </Btn>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: mostrarPagos ? "#475569" : "#cbd5e1", fontWeight: 500 }}>
          Período Pago:
        </span>
        <select
          value={filtroPeriodo}
          onChange={e => setFiltroPeriodo(e.target.value)}
          style={{ ...selectStyle, width: "140px", borderColor: mostrarPagos ? undefined : "#e2e8f0", color: mostrarPagos ? undefined : "#94a3b8" }}
          disabled={!mostrarPagos}
        >
          <option value="mes_atual">Mês Atual</option>
          <option value="ano_atual">Ano Atual</option>
          <option value="personalizado">Personalizado</option>
          <option value="todos">Todos</option>
        </select>
        {mostrarPagos && filtroPeriodo === "personalizado" && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              style={{ ...inputStyle, width: "125px", padding: "4px 8px", fontSize: "12px" }}
            />
            <span style={{ fontSize: "11px", color: "#64748b" }}>até</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              style={{ ...inputStyle, width: "125px", padding: "4px 8px", fontSize: "12px" }}
            />
          </div>
        )}
      </div>

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
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Agendados"      value={loading ? "..." : totais.agendado}     color="warning" />
          <KpiCard label="Em Andamento"   value={loading ? "..." : totais.em_andamento} color="info" />
          <KpiCard
            label="Concluídos"
            value={loading ? "..." : totais.concluido}
            color="success"
            sub={loading ? undefined : `${totais.concluidoPendente} pendentes / ${totais.concluidoPago} pagos`}
          />
          <KpiCard
            label={mostrarPagos ? "Receita Paga (Período)" : "Receita Pendente"}
            value={loading ? "..." : `R$ ${receitaExibida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            color="success"
            sub={loading ? undefined : `Total Geral: R$ ${totais.receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          />
        </div>

        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={filtrados.length} label="fretes" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="status" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              <Th sortKey="origem" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Rota</Th>
              <Th sortKey="veiculos.placa" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Veículo</Th>
              <Th sortKey="motoristas.nome" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Motorista</Th>
              <Th sortKey="data_coleta_prevista" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Coleta</Th>
              <Th sortKey="valor_frete" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor (R$)</Th>
              <Th sortKey="km_total" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>KM</Th>
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
              ordenados.map(frete => {
                const veiculo   = Array.isArray(frete.veiculos) ? frete.veiculos[0] : frete.veiculos;
                const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
                return (
                  <Tr key={frete.id} onClick={() => router.push(`/fretes/${frete.id}/editar`)}>
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
                      <div style={{ fontWeight: 700 }}>
                        {frete.valor_frete
                          ? frete.valor_frete.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                          : "—"}
                      </div>
                      <div style={{ marginTop: "2px" }}>
                        {frete.pago ? (
                          <Badge variant="success">Pago</Badge>
                        ) : frete.status === "concluido" ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                            <Badge variant="danger">Pendente</Badge>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Confirmar recebimento deste frete?")) {
                                  await handleMarcarPago(frete.id);
                                }
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#16a34a",
                                fontSize: "10px",
                                cursor: "pointer",
                                padding: "2px 4px",
                                borderRadius: "4px",
                                textDecoration: "underline",
                                fontWeight: 600,
                                marginTop: "2px",
                              }}
                            >
                              Confirmar Recebimento
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>A faturar</span>
                        )}
                      </div>
                    </Td>
                    <Td style={{ textAlign: "right" }}>{frete.km_total?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
                        <a href={`/fretes/${frete.id}`} style={{ color: "#64748b", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Ver</a>
                        <a href={`/fretes/${frete.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        {!frete.pago && frete.status === "concluido" && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("Confirmar recebimento deste frete?")) {
                                await handleMarcarPago(frete.id);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#16a34a",
                              fontWeight: 600,
                              cursor: "pointer",
                              padding: 0,
                              fontSize: "inherit",
                              fontFamily: "inherit",
                            }}
                          >
                            Receber
                          </button>
                        )}
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

        {/* Mobile: cards */}
        <MobileList count={filtrados.length} label="fretes">
          {loading ? null : ordenados.map(frete => {
            const veiculo   = Array.isArray(frete.veiculos) ? frete.veiculos[0] : frete.veiculos;
            const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
            const statusColor = frete.status === "concluido" ? "#16a34a" : frete.status === "em_andamento" ? "#2563eb" : frete.status === "cancelado" ? "#ef4444" : "#eab308";
            return (
              <MobileCard
                key={frete.id}
                href={`/fretes/${frete.id}/editar`}
                title={`${frete.origem} → ${frete.destino}`}
                subtitle={motorista?.nome ?? "Sem motorista"}
                badge={
                  <Badge variant={STATUS_VAR[frete.status] ?? "default"}>
                    {STATUS_LABEL[frete.status] ?? frete.status}
                  </Badge>
                }
                highlight={statusColor}
                details={[
                  { label: "Valor", value: frete.valor_frete ? `R$ ${frete.valor_frete.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                  { label: "Veículo", value: veiculo?.placa ?? "—" },
                  { label: "Coleta", value: frete.data_coleta_prevista ? new Date(frete.data_coleta_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Pgto", value: frete.pago ? <Badge variant="success">Pago</Badge> : frete.status === "concluido" ? <Badge variant="danger">Pendente</Badge> : "A faturar" },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/fretes/novo" label="Novo Frete" />
      </div>
    </div>
  );
}

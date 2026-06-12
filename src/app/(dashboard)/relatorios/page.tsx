"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveAs } from "file-saver";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { loadAll } from "@/lib/utils/loadAll";
import { PageHeader, KpiCard, DataTable, Th, Td, Tr, Badge, Btn, selectStyle, EmptyState } from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";

type PedidoResultado = {
  id: string | null;
  status: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  receita: number | null;
  km_total: number | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  qtd_entregas: number | null;
  motoristas: { nome: string } | { nome: string }[] | null;
  veiculos: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
};

type VeiculoResultado = {
  veiculo_id: string | null;
  placa: string | null;
  modelo: string | null;
  mes_referencia: string | null;
  qtd_pedidos: number | null;
  receita_pedidos: number | null;
  custo_combustivel: number | null;
  custo_despesas: number | null;
};

type AgrupadoMotorista = {
  chave: string;
  label: string;
  qtdPedidos: number;
  receita: number;
  km: number;
};

type AgrupadoVeiculo = {
  chave: string;
  label: string;
  qtdPedidos: number;
  receita: number;
  custoCombustivel: number;
  custoDespesas: number;
  custoTotal: number;
  lucro: number;
  margem: number;
};

const fmtBRL = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtPct = (v: number | null) =>
  v != null ? `${v.toFixed(1)}%` : "—";

const statusVar: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};

type Modo = "mes" | "ano" | "range";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function RelatoriosPage() {
  const router = useRouter();
  const now = new Date();
  const [modo, setModo] = useState<Modo>("mes");
  const [ano, setAno]   = useState(String(now.getFullYear()));
  const [mes, setMes]   = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [dataInicio, setDataInicio] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dataFim,    setDataFim]    = useState(isoDate(now));
  const [pedidos, setPedidos] = useState<PedidoResultado[]>([]);
  const [veiculosRes, setVeiculosRes] = useState<VeiculoResultado[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<"periodo" | "motorista" | "veiculo">("periodo");
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const periodo = useMemo(() => {
    if (modo === "range") {
      return { inicio: dataInicio, fim: dataFim };
    }
    if (modo === "ano") {
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
    }
    const fim = new Date(parseInt(ano), parseInt(mes), 0).toISOString().slice(0, 10);
    return { inicio: `${ano}-${mes}-01`, fim };
  }, [modo, ano, mes, dataInicio, dataFim]);

  const periodoLabel = useMemo(() => {
    if (modo === "range") return `${dataInicio} → ${dataFim}`;
    if (modo === "ano") return ano;
    return `${ano}-${mes}`;
  }, [modo, ano, mes, dataInicio, dataFim]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      // Pedidos com resultado (receita por pedido)
      const pData = await loadAll<PedidoResultado>((from, to) =>
        supabase.from("pedidos_com_resultado")
          .select("id,status,data_inicio_real,data_fim_real,data_inicio_prevista,data_fim_prevista,receita,km_total,motorista_id,veiculo_id,qtd_entregas,motoristas(nome),veiculos(placa,modelo)")
          .eq("empresa_id", ue.empresa_id)
          .gte("data_inicio_real", periodo.inicio)
          .lte("data_inicio_real", periodo.fim + "T23:59:59")
          .order("data_inicio_real", { ascending: false })
          .range(from, to)
      );
      setPedidos(pData);

      // Veículos resultado período (custos por mês)
      const { data: vData } = await supabase
        .from("veiculos_resultado_periodo")
        .select("veiculo_id,placa,modelo,mes_referencia,qtd_pedidos,receita_pedidos,custo_combustivel,custo_despesas")
        .eq("empresa_id", ue.empresa_id)
        .gte("mes_referencia", periodo.inicio.slice(0, 7) + "-01")
        .lte("mes_referencia", periodo.fim.slice(0, 7) + "-31");
      setVeiculosRes((vData ?? []) as VeiculoResultado[]);

      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.inicio, periodo.fim]);

  const kpis = useMemo(() => {
    const concluidos = pedidos.filter(f => f.status === "concluido");
    const receita = concluidos.reduce((s, f) => s + (f.receita ?? 0), 0);
    const custoCombustivel = veiculosRes.reduce((s, v) => s + (v.custo_combustivel ?? 0), 0);
    const custoDespesas = veiculosRes.reduce((s, v) => s + (v.custo_despesas ?? 0), 0);
    const custoTotal = custoCombustivel + custoDespesas;
    const lucro = receita - custoTotal;
    return {
      qtd:     pedidos.length,
      receita,
      custoCombustivel,
      custoDespesas,
      custo:   custoTotal,
      lucro,
      km:      concluidos.reduce((s, f) => s + (f.km_total ?? 0), 0),
      margem:  receita > 0 ? (lucro / receita) * 100 : 0,
    };
  }, [pedidos, veiculosRes]);

  const porMotorista = useMemo((): AgrupadoMotorista[] => {
    const map = new Map<string, AgrupadoMotorista>();
    for (const f of pedidos.filter(f => f.status === "concluido")) {
      const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
      const chave = f.motorista_id ?? "sem-motorista";
      const label = m?.nome ?? "Sem motorista";
      const cur = map.get(chave) ?? { chave, label, qtdPedidos: 0, receita: 0, km: 0 };
      cur.qtdPedidos++;
      cur.receita += f.receita ?? 0;
      cur.km += f.km_total ?? 0;
      map.set(chave, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.qtdPedidos - a.qtdPedidos);
  }, [pedidos]);

  const porVeiculo = useMemo((): AgrupadoVeiculo[] => {
    const map = new Map<string, AgrupadoVeiculo>();
    // Agregar a partir de veiculos_resultado_periodo (custos e receita)
    for (const v of veiculosRes) {
      const chave = v.veiculo_id ?? "sem-veiculo";
      const label = v.placa ? `${v.placa} — ${v.modelo ?? ""}` : "Sem veículo";
      const cur = map.get(chave) ?? {
        chave, label,
        qtdPedidos: 0, receita: 0,
        custoCombustivel: 0, custoDespesas: 0, custoTotal: 0,
        lucro: 0, margem: 0,
      };
      cur.qtdPedidos += v.qtd_pedidos ?? 0;
      cur.receita += v.receita_pedidos ?? 0;
      cur.custoCombustivel += v.custo_combustivel ?? 0;
      cur.custoDespesas += v.custo_despesas ?? 0;
      map.set(chave, cur);
    }
    return Array.from(map.values())
      .map(r => {
        const custoTotal = r.custoCombustivel + r.custoDespesas;
        const lucro = r.receita - custoTotal;
        const margem = r.receita > 0 ? (lucro / r.receita) * 100 : 0;
        return { ...r, custoTotal, lucro, margem };
      })
      .sort((a, b) => b.receita - a.receita);
  }, [veiculosRes]);

  const toCSV = (headers: string[], rows: string[][]) => {
    const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
    return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  };

  const exportCSV = () => {
    try {
    if (tab === "periodo") {
      const headers = ["Status","Data Início","Receita","KM Total","Qtd Entregas","Motorista","Veículo"];
      const rows = pedidos.map(f => {
        const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
        const v = Array.isArray(f.veiculos)   ? f.veiculos[0]   : f.veiculos;
        return [
          f.status ?? "",
          f.data_inicio_real ? new Date(f.data_inicio_real).toLocaleDateString("pt-BR") : "",
          (f.receita ?? 0).toFixed(2).replace(".", ","),
          (f.km_total ?? 0).toString(),
          (f.qtd_entregas ?? 0).toString(),
          m?.nome ?? "",
          v ? `${v.placa} ${v.modelo}` : "",
        ];
      });
      saveAs(toCSV(headers, rows), `relatorio-pedidos-${periodoLabel}.csv`);
    } else if (tab === "motorista") {
      const headers = ["Nome","Pedidos","Receita","KM"];
      const rows = porMotorista.map(r => [
        r.label,
        r.qtdPedidos.toString(),
        r.receita.toFixed(2).replace(".", ","),
        r.km.toString(),
      ]);
      saveAs(toCSV(headers, rows), `relatorio-motoristas-${periodoLabel}.csv`);
    } else {
      const headers = ["Veículo","Pedidos","Receita","Combustível","Despesas","Custo Total","Lucro","Margem %"];
      const rows = porVeiculo.map(r => [
        r.label,
        r.qtdPedidos.toString(),
        r.receita.toFixed(2).replace(".", ","),
        r.custoCombustivel.toFixed(2).replace(".", ","),
        r.custoDespesas.toFixed(2).replace(".", ","),
        r.custoTotal.toFixed(2).replace(".", ","),
        r.lucro.toFixed(2).replace(".", ","),
        r.margem.toFixed(1).replace(".", ","),
      ]);
      saveAs(toCSV(headers, rows), `relatorio-veiculos-${periodoLabel}.csv`);
    }
    setExportMsg("Download iniciado!");
    setTimeout(() => setExportMsg(null), 3000);
    } catch {
      setExportMsg("Erro ao gerar o arquivo. Tente novamente.");
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  const meses = [
    ["01","Janeiro"],["02","Fevereiro"],["03","Março"],["04","Abril"],
    ["05","Maio"],["06","Junho"],["07","Julho"],["08","Agosto"],
    ["09","Setembro"],["10","Outubro"],["11","Novembro"],["12","Dezembro"],
  ];
  const anos = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Relatórios Financeiros" subtitle="Resultado por período">
        <Btn variant="outline" onClick={exportCSV} disabled={loading || (tab === "periodo" && pedidos.length === 0) || (tab === "motorista" && porMotorista.length === 0) || (tab === "veiculo" && porVeiculo.length === 0)}>
          ↓ Exportar CSV
        </Btn>
      </PageHeader>

      {exportMsg && (
        <div role="status" style={{ padding: "8px 16px", background: exportMsg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", borderBottom: `1px solid ${exportMsg.startsWith("Erro") ? "#fecaca" : "#bbf7d0"}`, color: exportMsg.startsWith("Erro") ? "#b91c1c" : "#15803d", fontSize: 13 }}>
          {exportMsg}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Filtro */}
        <div className="m-stack" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>Período:</span>

          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
            {([
              ["mes", "Mês"],
              ["ano", "Ano"],
              ["range", "Range livre"],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setModo(key)} style={{
                padding: "6px 14px", border: "none", cursor: "pointer", fontSize: "12px",
                fontWeight: modo === key ? 700 : 500,
                background: modo === key ? "#2563eb" : "#fff",
                color: modo === key ? "#fff" : "#475569",
                minHeight: "44px",
              }}>{label}</button>
            ))}
          </div>

          {modo === "mes" && (
            <>
              <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...selectStyle, minWidth: "120px", flex: 1 }}>
                {meses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={ano} onChange={e => setAno(e.target.value)} style={{ ...selectStyle, minWidth: "80px", flex: "0 0 auto" }}>
                {anos.map(a => <option key={a}>{a}</option>)}
              </select>
            </>
          )}

          {modo === "ano" && (
            <select value={ano} onChange={e => setAno(e.target.value)} style={{ ...selectStyle, minWidth: "80px", flex: "0 0 auto" }}>
              {anos.map(a => <option key={a}>{a}</option>)}
            </select>
          )}

          {modo === "range" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ ...selectStyle, minWidth: 0, flex: 1 }} />
              <span style={{ color: "#94a3b8", fontSize: "13px", flexShrink: 0 }}>→</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ ...selectStyle, minWidth: 0, flex: 1 }} />
            </div>
          )}

          {loading && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Carregando...</span>}
        </div>

        {/* KPIs */}
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", minWidth: 0 }}>
          <KpiCard label="Pedidos no Período" value={loading ? "..." : kpis.qtd} />
          <KpiCard label="Receita Total"       value={<span style={{ fontSize: "clamp(11px,3vw,16px)", display: "block", wordBreak: "break-all" }}>{loading ? "..." : fmtBRL(kpis.receita)}</span>}  color="success" />
          <KpiCard label="Custo Total"         value={<span style={{ fontSize: "clamp(11px,3vw,16px)", display: "block", wordBreak: "break-all" }}>{loading ? "..." : fmtBRL(kpis.custo)}</span>}    color="danger" />
          <KpiCard label="Lucro Bruto"         value={<span style={{ fontSize: "clamp(11px,3vw,16px)", display: "block", wordBreak: "break-all" }}>{loading ? "..." : fmtBRL(kpis.lucro)}</span>}    color={kpis.lucro >= 0 ? "success" : "danger"} />
          <KpiCard label="Margem"              value={loading ? "..." : fmtPct(kpis.margem)}   color={kpis.margem >= 0 ? "success" : "danger"} />
          <KpiCard label="KM Rodados"          value={loading ? "..." : kpis.km.toLocaleString("pt-BR")} color="info" />
        </div>

        {/* Tabs */}
        <div className="m-tabs-scroll" style={{ display: "flex", borderBottom: "1px solid #e2e8f0", gap: "0" }}>
          {([
            ["periodo",   "Por Período"],
            ["motorista", "Por Motorista"],
            ["veiculo",   "Por Veículo"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: "8px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: tab === key ? 700 : 500,
              color: tab === key ? "#2563eb" : "#64748b",
              borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent",
              minHeight: "44px", whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da aba */}
        {tab === "periodo" && (
          <>
            {/* Desktop */}
            <div className="m-hide">
              <DataTable count={pedidos.length} label="pedidos">
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th>Data Início</Th>
                    <Th>Motorista</Th>
                    <Th>Veículo</Th>
                    <Th style={{ textAlign: "right" }}>Receita</Th>
                    <Th style={{ textAlign: "right" }}>Qtd Entregas</Th>
                    <Th style={{ textAlign: "right" }}>KM</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
                  ) : pedidos.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState message="Nenhum pedido encontrado para este período." icon="📊" /></td></tr>
                  ) : (
                    pedidos.map(f => {
                      const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
                      const v = Array.isArray(f.veiculos)   ? f.veiculos[0]   : f.veiculos;
                      return (
                        <Tr key={f.id}>
                          <Td><Badge variant={statusVar[f.status ?? ""] ?? "default"}>{f.status ?? "—"}</Badge></Td>
                          <Td>{f.data_inicio_real ? new Date(f.data_inicio_real).toLocaleDateString("pt-BR") : "—"}</Td>
                          <Td style={{ color: "#64748b" }}>{m?.nome ?? "—"}</Td>
                          <Td style={{ color: "#64748b" }}>{v ? `${v.placa} — ${v.modelo}` : "—"}</Td>
                          <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(f.receita)}</Td>
                          <Td style={{ textAlign: "right" }}>{f.qtd_entregas ?? 0}</Td>
                          <Td style={{ textAlign: "right" }}>{f.km_total?.toLocaleString("pt-BR") ?? "—"}</Td>
                        </Tr>
                      );
                    })
                  )}
                </tbody>
              </DataTable>
            </div>

            {/* Mobile */}
            <div className="m-show-block">
              {loading ? (
                <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "32px" }}>Carregando...</div>
              ) : (
                <MobileList
                  count={pedidos.length}
                  label="pedidos"
                  emptyMessage="Nenhum pedido encontrado para este período."
                  emptyIcon="📊"
                >
                  {pedidos.map(f => {
                    const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
                    const v = Array.isArray(f.veiculos)   ? f.veiculos[0]   : f.veiculos;
                    const statusColor = f.status === "concluido" ? "#16a34a"
                      : f.status === "em_andamento" ? "#2563eb"
                      : f.status === "cancelado" ? "#ef4444" : "#eab308";
                    return (
                      <MobileCard
                        key={f.id}
                        title={m?.nome ?? "Sem motorista"}
                        subtitle={v ? `${v.placa} — ${v.modelo}` : "Sem veículo"}
                        badge={<Badge variant={statusVar[f.status ?? ""] ?? "default"}>{f.status ?? "—"}</Badge>}
                        highlight={statusColor}
                        details={[
                          { label: "Data Início", value: f.data_inicio_real ? new Date(f.data_inicio_real).toLocaleDateString("pt-BR") : "—" },
                          { label: "Receita",     value: <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(f.receita)}</span> },
                          { label: "Entregas",    value: f.qtd_entregas ?? 0 },
                          { label: "KM",          value: f.km_total?.toLocaleString("pt-BR") ?? "—" },
                        ]}
                      />
                    );
                  })}
                </MobileList>
              )}
            </div>
          </>
        )}

        {tab === "motorista" && (
          loading
            ? <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "32px" }}>Carregando...</div>
            : porMotorista.length === 0
              ? <EmptyState message="Nenhum pedido concluído neste período." icon="📊" />
              : (
                <>
                  {/* Desktop */}
                  <div className="m-hide">
                    <DataTable count={porMotorista.length} label="motoristas">
                      <thead>
                        <tr>
                          <Th>Motorista</Th>
                          <Th style={{ textAlign: "right" }}>Qtd Pedidos</Th>
                          <Th style={{ textAlign: "right" }}>Receita</Th>
                          <Th style={{ textAlign: "right" }}>KM Rodado</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {porMotorista.map(r => (
                          <Tr key={r.chave}>
                            <Td style={{ fontWeight: 600 }}>{r.label}</Td>
                            <Td style={{ textAlign: "right" }}>{r.qtdPedidos}</Td>
                            <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(r.receita)}</Td>
                            <Td style={{ textAlign: "right" }}>{r.km.toLocaleString("pt-BR")}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>

                  {/* Mobile */}
                  <div className="m-show-block">
                    <MobileList count={porMotorista.length} label="motoristas">
                      {porMotorista.map(r => (
                        <MobileCard
                          key={r.chave}
                          title={r.label}
                          highlight="#2563eb"
                          details={[
                            { label: "Qtd Pedidos", value: r.qtdPedidos },
                            { label: "Receita",     value: <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(r.receita)}</span> },
                            { label: "KM Rodado",   value: r.km.toLocaleString("pt-BR") },
                          ]}
                        />
                      ))}
                    </MobileList>
                  </div>
                </>
              )
        )}

        {tab === "veiculo" && (
          loading
            ? <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "32px" }}>Carregando...</div>
            : porVeiculo.length === 0
              ? <EmptyState message="Nenhum dado de veículo neste período." icon="🚛" />
              : (
                <>
                  {/* Desktop */}
                  <div className="m-hide">
                    <DataTable count={porVeiculo.length} label="veículos">
                      <thead>
                        <tr>
                          <Th>Veículo</Th>
                          <Th style={{ textAlign: "right" }}>Pedidos</Th>
                          <Th style={{ textAlign: "right" }}>Receita</Th>
                          <Th style={{ textAlign: "right" }}>Combustível</Th>
                          <Th style={{ textAlign: "right" }}>Despesas</Th>
                          <Th style={{ textAlign: "right" }}>Custo Total</Th>
                          <Th style={{ textAlign: "right" }}>Lucro</Th>
                          <Th style={{ textAlign: "right" }}>Margem</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {porVeiculo.map(r => (
                          <Tr key={r.chave}>
                            <Td style={{ fontWeight: 600 }}>{r.label}</Td>
                            <Td style={{ textAlign: "right" }}>{r.qtdPedidos}</Td>
                            <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(r.receita)}</Td>
                            <Td style={{ textAlign: "right", color: "#64748b" }}>{fmtBRL(r.custoCombustivel)}</Td>
                            <Td style={{ textAlign: "right", color: "#64748b" }}>{fmtBRL(r.custoDespesas)}</Td>
                            <Td style={{ textAlign: "right", color: "#dc2626" }}>{fmtBRL(r.custoTotal)}</Td>
                            <Td style={{ textAlign: "right", fontWeight: 700, color: r.lucro >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(r.lucro)}</Td>
                            <Td style={{ textAlign: "right", color: r.margem >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(r.margem)}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>

                  {/* Mobile */}
                  <div className="m-show-block">
                    <MobileList count={porVeiculo.length} label="veículos">
                      {porVeiculo.map(r => (
                        <MobileCard
                          key={r.chave}
                          title={r.label}
                          highlight={r.lucro >= 0 ? "#16a34a" : "#dc2626"}
                          details={[
                            { label: "Pedidos",      value: r.qtdPedidos },
                            { label: "Receita",      value: <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(r.receita)}</span> },
                            { label: "Combustível",  value: fmtBRL(r.custoCombustivel) },
                            { label: "Despesas",     value: fmtBRL(r.custoDespesas) },
                            { label: "Custo Total",  value: <span style={{ color: "#dc2626" }}>{fmtBRL(r.custoTotal)}</span> },
                            { label: "Lucro",        value: <span style={{ fontWeight: 700, color: r.lucro >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(r.lucro)}</span> },
                            { label: "Margem",       value: <span style={{ color: r.margem >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(r.margem)}</span> },
                          ]}
                        />
                      ))}
                    </MobileList>
                  </div>
                </>
              )
        )}

      </div>
    </div>
  );
}

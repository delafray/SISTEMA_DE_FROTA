"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveAs } from "file-saver";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { PageHeader, KpiCard, DataTable, Th, Td, Tr, Badge, Btn, selectStyle, EmptyState } from "@/components/ui/ds";

type FreteResultado = {
  id: string | null;
  origem: string | null;
  destino: string | null;
  status: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  receita: number | null;
  custo_combustivel: number | null;
  custo_comissao: number | null;
  custo_despesas: number | null;
  custo_total: number | null;
  lucro_bruto: number | null;
  margem_pct: number | null;
  km_total: number | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; modelo: string } | null;
};

type Agrupado = {
  chave: string;
  label: string;
  qtd: number;
  receita: number;
  custo: number;
  lucro: number;
  km: number;
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

function AgrupadoTable({ rows }: { rows: Agrupado[] }) {
  if (rows.length === 0) {
    return <EmptyState message="Nenhum frete concluído neste período." icon="📊" />;
  }
  return (
    <DataTable count={rows.length} label="registros">
      <thead>
        <tr>
          <Th>Nome</Th>
          <Th style={{ textAlign: "right" }}>Fretes</Th>
          <Th style={{ textAlign: "right" }}>Receita</Th>
          <Th style={{ textAlign: "right" }}>Custo</Th>
          <Th style={{ textAlign: "right" }}>Lucro</Th>
          <Th style={{ textAlign: "right" }}>Margem</Th>
          <Th style={{ textAlign: "right" }}>KM</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <Tr key={r.chave}>
            <Td style={{ fontWeight: 600 }}>{r.label}</Td>
            <Td style={{ textAlign: "right" }}>{r.qtd}</Td>
            <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(r.receita)}</Td>
            <Td style={{ textAlign: "right", color: "#dc2626" }}>{fmtBRL(r.custo)}</Td>
            <Td style={{ textAlign: "right", fontWeight: 700, color: r.lucro >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(r.lucro)}</Td>
            <Td style={{ textAlign: "right", color: r.margem >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(r.margem)}</Td>
            <Td style={{ textAlign: "right" }}>{r.km.toLocaleString("pt-BR")}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default function RelatoriosPage() {
  const router = useRouter();
  const now = new Date();
  const [modo, setModo] = useState<Modo>("mes");
  const [ano, setAno]   = useState(String(now.getFullYear()));
  const [mes, setMes]   = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [dataInicio, setDataInicio] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dataFim,    setDataFim]    = useState(isoDate(now));
  const [todos, setTodos] = useState<FreteResultado[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<"periodo" | "motorista" | "veiculo">("periodo");

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
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<FreteResultado>((from, to) =>
        supabase.from("fretes_com_resultado")
          .select("id,origem,destino,status,data_inicio,data_fim,receita,custo_combustivel,custo_comissao,custo_despesas,custo_total,lucro_bruto,margem_pct,km_total,motorista_id,veiculo_id,motoristas(nome),veiculos(placa,modelo)")
          .eq("empresa_id", ue.empresa_id)
          .gte("data_inicio", periodo.inicio)
          .lte("data_inicio", periodo.fim)
          .order("data_inicio", { ascending: false })
          .range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.inicio, periodo.fim]);

  const kpis = useMemo(() => {
    const concluidos = todos.filter(f => f.status === "concluido");
    return {
      qtd:     todos.length,
      receita: concluidos.reduce((s, f) => s + (f.receita ?? 0), 0),
      custo:   concluidos.reduce((s, f) => s + (f.custo_total ?? 0), 0),
      lucro:   concluidos.reduce((s, f) => s + (f.lucro_bruto ?? 0), 0),
      km:      concluidos.reduce((s, f) => s + (f.km_total ?? 0), 0),
      margem:  concluidos.length > 0
        ? concluidos.reduce((s, f) => s + (f.margem_pct ?? 0), 0) / concluidos.length
        : 0,
    };
  }, [todos]);

  const porMotorista = useMemo((): Agrupado[] => {
    const map = new Map<string, Agrupado>();
    for (const f of todos.filter(f => f.status === "concluido")) {
      const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
      const chave = f.motorista_id ?? "sem-motorista";
      const label = m?.nome ?? "Sem motorista";
      const cur = map.get(chave) ?? { chave, label, qtd: 0, receita: 0, custo: 0, lucro: 0, km: 0, margem: 0 };
      cur.qtd++;
      cur.receita += f.receita ?? 0;
      cur.custo   += f.custo_total ?? 0;
      cur.lucro   += f.lucro_bruto ?? 0;
      cur.km      += f.km_total ?? 0;
      map.set(chave, cur);
    }
    return Array.from(map.values())
      .map(r => ({ ...r, margem: r.receita > 0 ? (r.lucro / r.receita) * 100 : 0 }))
      .sort((a, b) => b.receita - a.receita);
  }, [todos]);

  const porVeiculo = useMemo((): Agrupado[] => {
    const map = new Map<string, Agrupado>();
    for (const f of todos.filter(f => f.status === "concluido")) {
      const v = Array.isArray(f.veiculos) ? f.veiculos[0] : f.veiculos;
      const chave = f.veiculo_id ?? "sem-veiculo";
      const label = v ? `${v.placa} — ${v.modelo}` : "Sem veículo";
      const cur = map.get(chave) ?? { chave, label, qtd: 0, receita: 0, custo: 0, lucro: 0, km: 0, margem: 0 };
      cur.qtd++;
      cur.receita += f.receita ?? 0;
      cur.custo   += f.custo_total ?? 0;
      cur.lucro   += f.lucro_bruto ?? 0;
      cur.km      += f.km_total ?? 0;
      map.set(chave, cur);
    }
    return Array.from(map.values())
      .map(r => ({ ...r, margem: r.receita > 0 ? (r.lucro / r.receita) * 100 : 0 }))
      .sort((a, b) => b.receita - a.receita);
  }, [todos]);

  const toCSV = (headers: string[], rows: string[][]) => {
    const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
    return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  };

  const exportCSV = () => {
    if (tab === "periodo") {
      const headers = ["Rota","Status","Data Início","Receita","Cust.Combust.","Cust.Comissão","Cust.Despesas","Custo Total","Lucro Bruto","Margem %","KM Total","Motorista","Veículo"];
      const rows = todos.map(f => {
        const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
        const v = Array.isArray(f.veiculos)   ? f.veiculos[0]   : f.veiculos;
        return [
          `${f.origem ?? ""} → ${f.destino ?? ""}`,
          f.status ?? "",
          f.data_inicio ? new Date(f.data_inicio).toLocaleDateString("pt-BR") : "",
          (f.receita ?? 0).toFixed(2).replace(".", ","),
          (f.custo_combustivel ?? 0).toFixed(2).replace(".", ","),
          (f.custo_comissao ?? 0).toFixed(2).replace(".", ","),
          (f.custo_despesas ?? 0).toFixed(2).replace(".", ","),
          (f.custo_total ?? 0).toFixed(2).replace(".", ","),
          (f.lucro_bruto ?? 0).toFixed(2).replace(".", ","),
          (f.margem_pct ?? 0).toFixed(1).replace(".", ","),
          (f.km_total ?? 0).toString(),
          m?.nome ?? "",
          v ? `${v.placa} ${v.modelo}` : "",
        ];
      });
      saveAs(toCSV(headers, rows), `relatorio-periodo-${periodoLabel}.csv`);
    } else {
      const source = tab === "motorista" ? porMotorista : porVeiculo;
      const headers = ["Nome","Fretes","Receita","Custo","Lucro","Margem %","KM"];
      const rows = source.map(r => [
        r.label,
        r.qtd.toString(),
        r.receita.toFixed(2).replace(".", ","),
        r.custo.toFixed(2).replace(".", ","),
        r.lucro.toFixed(2).replace(".", ","),
        r.margem.toFixed(1).replace(".", ","),
        r.km.toString(),
      ]);
      saveAs(toCSV(headers, rows), `relatorio-${tab}-${periodoLabel}.csv`);
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
        <Btn variant="outline" onClick={exportCSV} disabled={loading || todos.length === 0}>
          ↓ Exportar CSV
        </Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Filtro */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
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
              }}>{label}</button>
            ))}
          </div>

          {modo === "mes" && (
            <>
              <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...selectStyle, width: "150px" }}>
                {meses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={ano} onChange={e => setAno(e.target.value)} style={{ ...selectStyle, width: "90px" }}>
                {anos.map(a => <option key={a}>{a}</option>)}
              </select>
            </>
          )}

          {modo === "ano" && (
            <select value={ano} onChange={e => setAno(e.target.value)} style={{ ...selectStyle, width: "100px" }}>
              {anos.map(a => <option key={a}>{a}</option>)}
            </select>
          )}

          {modo === "range" && (
            <>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ ...selectStyle, width: "150px" }} />
              <span style={{ color: "#94a3b8", fontSize: "13px" }}>→</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ ...selectStyle, width: "150px" }} />
            </>
          )}

          {loading && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Carregando...</span>}
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px" }}>
          <KpiCard label="Fretes no Período" value={loading ? "..." : kpis.qtd} />
          <KpiCard label="Receita Total"      value={loading ? "..." : fmtBRL(kpis.receita)}  color="success" />
          <KpiCard label="Custo Total"        value={loading ? "..." : fmtBRL(kpis.custo)}    color="danger" />
          <KpiCard label="Lucro Bruto"        value={loading ? "..." : fmtBRL(kpis.lucro)}    color={kpis.lucro >= 0 ? "success" : "danger"} />
          <KpiCard label="Margem Média"       value={loading ? "..." : fmtPct(kpis.margem)}   color={kpis.margem >= 0 ? "success" : "danger"} />
          <KpiCard label="KM Rodados"         value={loading ? "..." : kpis.km.toLocaleString("pt-BR")} color="info" />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", gap: "0" }}>
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
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da aba */}
        {tab === "periodo" && (
          <DataTable count={todos.length} label="fretes">
            <thead>
              <tr>
                <Th>Rota</Th>
                <Th>Status</Th>
                <Th>Data</Th>
                <Th>Motorista</Th>
                <Th style={{ textAlign: "right" }}>Receita</Th>
                <Th style={{ textAlign: "right" }}>Combustível</Th>
                <Th style={{ textAlign: "right" }}>Comissão</Th>
                <Th style={{ textAlign: "right" }}>Despesas</Th>
                <Th style={{ textAlign: "right" }}>Custo Total</Th>
                <Th style={{ textAlign: "right" }}>Lucro</Th>
                <Th style={{ textAlign: "right" }}>Margem</Th>
                <Th style={{ textAlign: "right" }}>KM</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
              ) : todos.length === 0 ? (
                <tr><td colSpan={12}><EmptyState message="Nenhum frete encontrado para este período." icon="📊" /></td></tr>
              ) : (
                todos.map(f => {
                  const m = Array.isArray(f.motoristas) ? f.motoristas[0] : f.motoristas;
                  return (
                    <Tr key={f.id}>
                      <Td>
                        <span style={{ fontWeight: 500 }}>{f.origem}</span>
                        <span style={{ color: "#94a3b8", fontSize: "10px", marginLeft: "4px" }}>→ {f.destino}</span>
                      </Td>
                      <Td><Badge variant={statusVar[f.status ?? ""] ?? "default"}>{f.status ?? "—"}</Badge></Td>
                      <Td>{f.data_inicio ? new Date(f.data_inicio).toLocaleDateString("pt-BR") : "—"}</Td>
                      <Td style={{ color: "#64748b" }}>{m?.nome ?? "—"}</Td>
                      <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtBRL(f.receita)}</Td>
                      <Td style={{ textAlign: "right", color: "#64748b" }}>{fmtBRL(f.custo_combustivel)}</Td>
                      <Td style={{ textAlign: "right", color: "#64748b" }}>{fmtBRL(f.custo_comissao)}</Td>
                      <Td style={{ textAlign: "right", color: "#64748b" }}>{fmtBRL(f.custo_despesas)}</Td>
                      <Td style={{ textAlign: "right", color: "#dc2626" }}>{fmtBRL(f.custo_total)}</Td>
                      <Td style={{ textAlign: "right", fontWeight: 700, color: (f.lucro_bruto ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtBRL(f.lucro_bruto)}</Td>
                      <Td style={{ textAlign: "right", color: (f.margem_pct ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtPct(f.margem_pct)}</Td>
                      <Td style={{ textAlign: "right" }}>{f.km_total?.toLocaleString("pt-BR") ?? "—"}</Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </DataTable>
        )}

        {tab === "motorista" && (
          loading
            ? <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "32px" }}>Carregando...</div>
            : <AgrupadoTable rows={porMotorista} />
        )}

        {tab === "veiculo" && (
          loading
            ? <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "32px" }}>Carregando...</div>
            : <AgrupadoTable rows={porVeiculo} />
        )}

      </div>
    </div>
  );
}

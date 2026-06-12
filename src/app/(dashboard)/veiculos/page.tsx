"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle, useTableSort } from "@/components/ui/ds";
import { ReportPdfButton } from "@/components/ui/ReportPdfButton";
import jsPDF from "jspdf";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Veiculo = {
  id: string; placa: string; marca: string; modelo: string; tipo: string;
  categoria: string | null; combustivel: string | null; ano: number | null;
  km_atual: number | null; apelido: string | null; ativo: boolean | null;
  ipva_vencimento: string | null;
};

export default function VeiculosPage() {
  const router = useRouter();
  const [todos, setTodos]       = useState<Veiculo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [motPorVeic, setMotPorVeic] = useState<Record<string, string>>({});
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Veiculo>((from, to) =>
        supabase.from("veiculos").select("id,placa,marca,modelo,tipo,categoria,combustivel,ano,km_atual,apelido,ativo,ipva_vencimento")
          .eq("empresa_id", ue.empresa_id).order("placa").range(from, to)
      );
      setTodos(data);
      setLoading(false);

      // motorista responsável atual (alocação ativa, status operacional)
      const [alRes, motRes] = await Promise.all([
        supabase.from("alocacoes").select("veiculo_id,motorista_id,status").is("fim", null),
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id),
      ]);
      const nomeById: Record<string, string> = {};
      for (const m of motRes.data ?? []) nomeById[m.id] = m.nome;
      const map: Record<string, string> = {};
      for (const a of alRes.data ?? []) {
        if (a.status === "operacional" && a.motorista_id) map[a.veiculo_id] = nomeById[a.motorista_id] ?? "—";
      }
      setMotPorVeic(map);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of todos) {
      m.set(v.id, normalizar([v.placa, v.marca, v.modelo, v.apelido, v.tipo, v.categoria].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(v => {
      if (filtroAtivo === "true"  && !v.ativo) return false;
      if (filtroAtivo === "false" && v.ativo)  return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(v.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroAtivo]);

  const ativos   = todos.filter(v => v.ativo).length;
  const inativos = todos.filter(v => !v.ativo).length;
  const hoje     = new Date();

  const { sortedData: ordenados, sortKey, sortDirection, handleSort } = useTableSort(filtrados, "placa", "asc");

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por placa, marca, modelo, apelido..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}
        style={{ ...selectStyle, width: "130px" }}>
        <option value="">Todos</option>
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} veículos
      </span>
    </div>
  );

  const buildPdf = (doc: jsPDF) => {
    // 1. Column configuration (total width = 269mm)
    const columns: { title: string; width: number; align?: "left" | "right" | "center" }[] = [
      { title: "Placa", width: 25 },
      { title: "Apelido", width: 40 },
      { title: "Marca / Modelo", width: 60 },
      { title: "Tipo", width: 40 },
      { title: "Combustível", width: 35 },
      { title: "Ano", width: 18 },
      { title: "KM Atual", width: 27, align: "right" },
      { title: "Status", width: 24, align: "center" }
    ];

    // 2. Page header and footer drawing helpers
    const drawHeader = (_pageNumber: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59); // Slate-800
      doc.text("SISTEMA DE FROTA", 14, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text("RELATÓRIO GERENCIAL DE VEÍCULOS", 14, 20);

      const emitidoEm = new Date().toLocaleString("pt-BR");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(`Emitido em: ${emitidoEm}`, 283, 15, { align: "right" });
      doc.text(`Registros Exibidos: ${filtrados.length}`, 283, 19, { align: "right" });

      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.5);
      doc.line(14, 23, 283, 23);
    };

    const drawFooter = (pageNumber: number) => {
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.5);
      doc.line(14, 192, 283, 192);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text("Sistema de Frota — Relatório Gerencial", 14, 197);
      doc.text(`Página ${pageNumber}`, 283, 197, { align: "right" });
    };

    const drawTableHeader = (yPos: number) => {
      doc.setFillColor(37, 99, 235); // #2563eb
      doc.rect(14, yPos, 269, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);

      let xPos = 14;
      columns.forEach(col => {
        const textX = col.align === "right" ? xPos + col.width - 2 : col.align === "center" ? xPos + col.width / 2 : xPos + 2;
        doc.text(col.title, textX, yPos + 5.5, { align: col.align || "left" });
        xPos += col.width;
      });
    };

    // 3. Populate Rows
    let page = 1;
    drawHeader(page);
    drawFooter(page);

    let y = 30;
    drawTableHeader(y);
    y += 8;

    filtrados.forEach((v, index) => {
      // Page break check (Landscape A4 height is 210mm, footer at 192mm)
      if (y > 180) {
        doc.addPage();
        page += 1;
        drawHeader(page);
        drawFooter(page);
        
        y = 30;
        drawTableHeader(y);
        y += 8;
      }

      // Alternate row backgrounds
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.rect(14, y, 269, 7.5, "F");
      }

      // Draw horizontal bottom border
      doc.setDrawColor(241, 245, 249); // #f1f5f9
      doc.setLineWidth(0.3);
      doc.line(14, y + 7.5, 283, y + 7.5);

      const apelido = v.apelido || "—";
      const modelo = `${v.marca} ${v.modelo}`;
      const tipo = `${v.tipo}${v.categoria ? ` / ${v.categoria}` : ""}`;
      const combustivel = v.combustivel?.replace("_", " ") || "—";
      const ano = v.ano ? String(v.ano) : "—";
      const km = v.km_atual ? v.km_atual.toLocaleString("pt-BR") : "—";
      const status = v.ativo ? "Ativo" : "Inativo";

      const rowData: { text: string; width: number; bold?: boolean; align?: "left" | "right" | "center" }[] = [
        { text: v.placa, width: 25, bold: true },
        { text: apelido, width: 40 },
        { text: modelo, width: 60 },
        { text: tipo, width: 40 },
        { text: combustivel, width: 35 },
        { text: ano, width: 18 },
        { text: km, width: 27, align: "right" },
        { text: status, width: 24, align: "center" }
      ];

      let xPos = 14;
      rowData.forEach((cell, idx) => {
        doc.setFont("helvetica", cell.bold ? "bold" : "normal");
        doc.setFontSize(8.5);
        
        if (idx === 0) {
          doc.setTextColor(15, 23, 42); // slate-900 for Placa
        } else {
          doc.setTextColor(71, 85, 105); // slate-600
        }

        const textX = cell.align === "right" ? xPos + cell.width - 2 : cell.align === "center" ? xPos + cell.width / 2 : xPos + 2;
        
        // Truncate text if it exceeds column width
        const maxTextW = cell.width - 4;
        let cellText = String(cell.text);
        if (doc.getTextWidth(cellText) > maxTextW) {
          cellText = doc.splitTextToSize(cellText, maxTextW)[0] + "...";
        }

        doc.text(cellText, textX, y + 5, { align: cell.align || "left" });
        xPos += cell.width;
      });

      y += 7.5;
    });

    // Draw summary block
    if (y > 165) {
      doc.addPage();
      page += 1;
      drawHeader(page);
      drawFooter(page);
      y = 30;
    } else {
      y += 5;
    }

    doc.setFillColor(241, 245, 249); // #f1f5f9
    doc.rect(14, y, 269, 15, "F");

    doc.setDrawColor(203, 213, 225); // #cbd5e1
    doc.setLineWidth(0.5);
    doc.rect(14, y, 269, 15, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59); // slate-800

    const ativosVal = filtrados.filter(v => v.ativo).length;
    const inativosVal = filtrados.filter(v => !v.ativo).length;

    doc.text("RESUMO DO RELATÓRIO", 18, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Total de Veículos Exibidos: ${filtrados.length}`, 18, y + 10.5);
    doc.text(`Ativos: ${ativosVal}`, 120, y + 10.5);
    doc.text(`Inativos: ${inativosVal}`, 180, y + 10.5);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Veículos" count={loading ? undefined : todos.length}>
        <div style={{ display: "flex", gap: "8px" }}>
          {!loading && todos.length > 0 && (
            <ReportPdfButton
              title="Relatório Gerencial de Veículos"
              fileName={`relatorio_veiculos_${new Date().toISOString().split("T")[0]}.pdf`}
              orientation="landscape"
              buildPdf={buildPdf}
            >
              Relatório
            </ReportPdfButton>
          )}
          <Btn href="/veiculos/novo" size="sm">+ Cadastrar Veículo</Btn>
        </div>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="m-kpi-grid" style={{ display: "grid", gap: "16px" }}>
          <KpiCard label="Total"     value={loading ? "..." : todos.length}  />
          <KpiCard label="Ativos"    value={loading ? "..." : ativos}   color="success" />
          <KpiCard label="Inativos"  value={loading ? "..." : inativos} color="danger" />
          <KpiCard label="Em viagem" value={0}                          color="info" />
        </div>

        {/* Mobile: toolbar de busca/filtro */}
        <div className="m-show-block">
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <SearchInput
              placeholder="Buscar placa, marca..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}
              style={{ ...selectStyle, minWidth: "100px", flex: "0 0 auto" }}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            {filtrados.length} de {todos.length} veículos
          </div>
        </div>

        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={filtrados.length} label="veículos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="placa" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Placa</Th>
              <Th sortKey="apelido" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Apelido</Th>
              <Th sortKey="marca" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Marca / Modelo</Th>
              <Th>Motorista</Th>
              <Th sortKey="tipo" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Tipo</Th>
              <Th sortKey="combustivel" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Combustível</Th>
              <Th sortKey="ano" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Ano</Th>
              <Th sortKey="km_atual" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>KM Atual</Th>
              <Th sortKey="ipva_vencimento" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Venc. IPVA</Th>
              <Th sortKey="ativo" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum veículo cadastrado." icon="🚛" action={<Btn href="/veiculos/novo">+ Cadastrar primeiro veículo</Btn>} />
                    : <EmptyState message="Nenhum veículo encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              ordenados.map(v => {
                const ipvaDate = v.ipva_vencimento ? new Date(v.ipva_vencimento + "T00:00:00") : null;
                const diasIpva = ipvaDate ? Math.ceil((ipvaDate.getTime() - hoje.getTime()) / 86400000) : null;
                const ipvaVar  = diasIpva === null ? "default" : diasIpva < 0 ? "danger" : diasIpva < 30 ? "warning" : "success";

                return (
                  <Tr key={v.id} muted={!v.ativo} onClick={() => router.push(`/veiculos/${v.id}/editar`)}>
                    <Td>{v.placa}</Td>
                    <Td>{v.apelido ?? "—"}</Td>
                    <Td>{v.marca} {v.modelo}</Td>
                    <Td>{motPorVeic[v.id] ?? <span style={{ color: "#cbd5e1" }}>—</span>}</Td>
                    <Td style={{ textTransform: "capitalize" }}>
                      {v.tipo}{v.categoria ? ` / ${v.categoria}` : ""}
                    </Td>
                    <Td style={{ textTransform: "capitalize" }}>{v.combustivel?.replace("_", " ") ?? "—"}</Td>
                    <Td>{v.ano}</Td>
                    <Td style={{ textAlign: "right" }}>{v.km_atual?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td>
                      {ipvaDate
                        ? <Badge variant={ipvaVar}>{ipvaDate.toLocaleDateString("pt-BR")}</Badge>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td><Badge variant={v.ativo ? "success" : "default"}>{v.ativo ? "Ativo" : "Inativo"}</Badge></Td>
                    <Td style={{ textAlign: "right" }}>
                      {/* Excluir saiu da listagem (regra do dono 12/06): excluir
                          só DENTRO do veículo e só se nunca teve movimento;
                          com histórico, o máximo é desativar lá dentro. */}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <Btn href={`/veiculos/${v.id}/editar`} size="xs" variant="outline">Editar</Btn>
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
        <MobileList count={filtrados.length} label="veículos">
          {loading ? null : ordenados.map(v => (
            <MobileCard
              key={v.id}
              onClick={() => router.push(`/veiculos/${v.id}/editar`)}
              title={`${v.placa}${v.apelido ? ` — ${v.apelido}` : ""}`}
              subtitle={`${v.marca} ${v.modelo}${v.ano ? ` • ${v.ano}` : ""}`}
              badge={<Badge variant={v.ativo ? "success" : "default"}>{v.ativo ? "Ativo" : "Inativo"}</Badge>}
              highlight={!v.ativo ? "#cbd5e1" : undefined}
              details={[
                { label: "Motorista", value: motPorVeic[v.id] ?? "—" },
                { label: "KM Atual", value: v.km_atual?.toLocaleString("pt-BR") ?? "—" },
                { label: "Tipo", value: `${v.tipo}${v.categoria ? ` / ${v.categoria}` : ""}` },
              ]}
            />
          ))}
        </MobileList>

        <MobileFAB href="/veiculos/novo" label="Cadastrar Veículo" />
      </div>
    </div>
  );
}

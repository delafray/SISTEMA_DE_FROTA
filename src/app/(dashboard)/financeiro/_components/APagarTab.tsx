"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Btn, DataTable, Th, Td, Tr, Badge, EmptyState, Alert,
  useTableSort, inputStyle, ActionBtn,
} from "@/components/ui/ds";
import { coletarEventos, type EventoFinanceiro, CAT_LABEL, CAT_COR } from "@/lib/financeiro/coletor";
import { MobileCard, MobileList } from "@/components/mobile";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const formatLocalISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const hoje = () => formatLocalISO(new Date());
const addDays = (iso: string, d: number) => {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return formatLocalISO(dt);
};

type ModalBaixa = {
  evento: EventoFinanceiro;
  dataPagamento: string;
};

export default function APagarTab({ empresaId }: { empresaId: string }) {
  const supabase = createClient();
  const [eventos, setEventos] = useState<EventoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modalBaixa, setModalBaixa] = useState<ModalBaixa | null>(null);
  const [filtro, setFiltro] = useState<"pendentes" | "atrasados" | "todos">("pendentes");
  const [periodo, setPeriodo] = useState<"30d" | "60d" | "90d">("30d");

  const hoje_ = hoje();

  const carregar = async () => {
    setErro("");
    const inicio = addDays(hoje_, -7);
    const dias = periodo === "30d" ? 30 : periodo === "60d" ? 60 : 90;
    const fim = addDays(hoje_, dias);

    const evs = await coletarEventos(supabase, {
      empresaId,
      inicio,
      fim,
      incluirProvisaoManutencao: false,
    }).catch(e => { setErro(e.message ?? String(e)); return []; });

    setEventos(evs.filter(e => e.tipo === "saida"));
    setLoading(false);
  };

  useEffect(() => { setLoading(true); carregar(); }, [empresaId, periodo]);

  const filtrados = useMemo(() => {
    return eventos.filter(ev => {
      if (filtro === "pendentes") return !ev.pago && !ev.isProvisao;
      if (filtro === "atrasados") return !ev.pago && !ev.isProvisao && ev.data < hoje_;
      return true;
    });
  }, [eventos, filtro, hoje_]);

  const { sortedData, sortKey, sortDirection, handleSort } = useTableSort<EventoFinanceiro>(filtrados, "data", "asc");

  const totalPendente = useMemo(() =>
    eventos.filter(e => !e.pago && !e.isProvisao).reduce((s, e) => s + e.valor, 0), [eventos]);
  const totalAtrasado = useMemo(() =>
    eventos.filter(e => !e.pago && !e.isProvisao && e.data < hoje_).reduce((s, e) => s + e.valor, 0), [eventos, hoje_]);
  const totalPago = useMemo(() =>
    eventos.filter(e => e.pago).reduce((s, e) => s + e.valor, 0), [eventos]);

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    setSalvando(true);
    const { tabela, id } = modalBaixa.evento.origem;

    let error: { message: string } | null = null;

    if (tabela === "abastecimentos") {
      ({ error } = await supabase.from("abastecimentos").update({ pago: true, data_pagamento: modalBaixa.dataPagamento }).eq("id", id));
    } else if (tabela === "manutencoes") {
      ({ error } = await supabase.from("manutencoes").update({ pago: true, data_pagamento: modalBaixa.dataPagamento }).eq("id", id));
    } else if (tabela === "despesas_avulsas") {
      ({ error } = await supabase.from("despesas_avulsas").update({ pago: true, data_pagamento: modalBaixa.dataPagamento }).eq("id", id));
    }

    if (error) { setErro(error.message); }
    else { setModalBaixa(null); await carregar(); }
    setSalvando(false);
  };

  // Só exibe botão de baixa para tabelas que têm coluna pago+data_pagamento
  const podeMarcarPago = (tabela: string) =>
    ["abastecimentos", "manutencoes", "despesas_avulsas"].includes(tabela);

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* KPIs */}
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>📤 A Pagar</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b" }}>{fmtBRL(totalPendente)}</div>
        </div>
        {totalAtrasado > 0 && (
          <div style={{ background: "#fff1f2", border: "1px solid #fda4af", borderRadius: "8px", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#be123c", textTransform: "uppercase" }}>🔴 Em Atraso</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#9f1239" }}>{fmtBRL(totalAtrasado)}</div>
          </div>
        )}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>✅ Pago no Período</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#334155" }}>{fmtBRL(totalPago)}</div>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {([["pendentes", "Pendentes"], ["atrasados", "Atrasados"], ["todos", "Todos"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              style={{
                padding: "4px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
                background: filtro === v ? "#2563eb" : "#fff",
                color: filtro === v ? "#fff" : "#475569",
                border: "1px solid #cbd5e1", cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
          {(["30d", "60d", "90d"] as const).map(p => (
            <button key={p} type="button" onClick={() => setPeriodo(p)}
              style={{
                padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "6px",
                background: periodo === p ? "#64748b" : "#fff",
                color: periodo === p ? "#fff" : "#94a3b8",
                border: "1px solid #e2e8f0", cursor: "pointer",
              }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {sortedData.length === 0
        ? <EmptyState icon="📤" message="Nenhum lançamento a pagar encontrado para este filtro." />
        : (
          <>
          <div className="m-hide">
          <DataTable count={sortedData.length} label="lançamentos">
            <thead>
              <tr>
                <Th sortKey="data" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Vencimento</Th>
                <Th sortKey="descricao" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Descrição</Th>
                <Th sortKey="categoria" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Categoria</Th>
                <Th sortKey="valor" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor</Th>
                <Th>Status</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(ev => {
                const atrasado = !ev.pago && ev.data < hoje_;
                return (
                  <Tr key={ev.id} muted={ev.isProvisao}>
                    <Td style={{ color: atrasado ? "#dc2626" : undefined, fontWeight: atrasado ? 700 : undefined }}>
                      {fmtDate(ev.data)}
                    </Td>
                    <Td>
                      <div style={{ fontSize: "12px" }}>{ev.descricao}</div>
                      {ev.contexto && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{ev.contexto}</div>}
                    </Td>
                    <Td>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: CAT_COR[ev.categoria] }}>
                        {CAT_LABEL[ev.categoria]}
                      </span>
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                      {fmtBRL(ev.valor)}
                    </Td>
                    <Td>
                      {ev.pago
                        ? <Badge variant="success">✓ Pago</Badge>
                        : ev.isProvisao
                          ? <Badge variant="default">Provisão</Badge>
                          : atrasado
                            ? <Badge variant="danger">⚠ Atrasado</Badge>
                            : <Badge variant="warning">Pendente</Badge>
                      }
                    </Td>
                    <Td>
                      {!ev.pago && !ev.isProvisao && podeMarcarPago(ev.origem.tabela) && (
                        <Btn size="xs" variant="danger"
                          onClick={() => setModalBaixa({ evento: ev, dataPagamento: hoje_ })}>
                          Pagar
                        </Btn>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: cards */}
          <MobileList count={sortedData.length} label="lançamentos">
            {sortedData.map(ev => {
              const atrasado = !ev.pago && ev.data < hoje_;
              const statusBadge = ev.pago
                ? <Badge variant="success">✓ Pago</Badge>
                : atrasado ? <Badge variant="danger">Atrasado</Badge>
                : <Badge variant="warning">Pendente</Badge>;
              return (
                <MobileCard
                  key={ev.id}
                  title={ev.descricao}
                  subtitle={ev.contexto ?? CAT_LABEL[ev.categoria]}
                  badge={statusBadge}
                  highlight={atrasado ? "#dc2626" : ev.pago ? "#16a34a" : "#eab308"}
                  details={[
                    { label: "Venc.", value: fmtDate(ev.data) },
                    { label: "Valor", value: fmtBRL(ev.valor) },
                  ]}
                  actions={
                    !ev.pago && !ev.isProvisao && podeMarcarPago(ev.origem.tabela) ? (
                      <Btn size="xs" variant="danger"
                        onClick={() => setModalBaixa({ evento: ev, dataPagamento: hoje_ })}>
                        Pagar
                      </Btn>
                    ) : undefined
                  }
                />
              );
            })}
          </MobileList>
          </>
        )}

      {/* Modal Baixa */}
      {modalBaixa && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px" }}>Confirmar Pagamento</h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 16px" }}>{modalBaixa.evento.descricao}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Valor Pago</label>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#dc2626" }}>{fmtBRL(modalBaixa.evento.valor)}</div>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Data do Pagamento</label>
                <input type="date" value={modalBaixa.dataPagamento}
                  onChange={e => setModalBaixa({ ...modalBaixa, dataPagamento: e.target.value })}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "20px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => setModalBaixa(null)} disabled={salvando}>Cancelar</Btn>
              <Btn variant="danger" onClick={confirmarBaixa} disabled={salvando || !modalBaixa.dataPagamento}>
                {salvando ? "Salvando..." : "✓ Confirmar Pagamento"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

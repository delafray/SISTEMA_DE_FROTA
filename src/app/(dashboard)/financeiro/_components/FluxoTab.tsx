"use client";
import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, DataTable, Th, Td, Tr, Badge, EmptyState, Alert, inputStyle } from "@/components/ui/ds";
import { coletarEventos, type EventoFinanceiro, CAT_LABEL, CAT_COR } from "@/lib/financeiro/coletor";
import { MobileCard, MobileList } from "@/components/mobile";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDiaSemana = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short" });

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

type Periodo = "7d" | "30d" | "60d" | "90d";

export default function FluxoTab({ empresas }: { empresas: string[] }) {
  const supabase = createClient();
  const [eventos, setEventos] = useState<EventoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [incluirProvisao, setIncluirProvisao] = useState(true);

  // Saldo do banco (persistido em localStorage por empresa)
  const lsKey = `saldoBanco:${[...empresas].sort().join("_")}`;
  const [saldoBanco, setSaldoBanco] = useState<number>(0);
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState("");

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(lsKey) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v) setSaldoBanco(parseFloat(v) || 0);
  }, [lsKey]);

  const range = useMemo(() => {
    const inicio = hoje();
    const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : periodo === "60d" ? 60 : 90;
    const fim = addDays(inicio, dias);
    // Incluir 30 dias passados para mostrar atrasados
    const inicioComAtrasados = addDays(inicio, -30);
    return { inicio: inicioComAtrasados, fim, dataAtual: inicio };
  }, [periodo]);

  const carregar = async () => {
    setErro("");
    const evs = await coletarEventos(supabase, {
      empresas,
      inicio: range.inicio,
      fim: range.fim,
      incluirProvisaoManutencao: incluirProvisao,
    }).catch(e => { setErro(e.message ?? String(e)); return []; });
    setEventos(evs);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    carregar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresas, periodo, incluirProvisao]);

  const [erroSaldo, setErroSaldo] = useState("");

  const salvarSaldo = () => {
    const normalizado = saldoInput.replace(",", ".");
    const num = parseFloat(normalizado);
    if (isNaN(num)) {
      setErroSaldo("Informe um valor válido (ex: 1500,00).");
      return;
    }
    setErroSaldo("");
    setSaldoBanco(num);
    if (typeof window !== "undefined") window.localStorage.setItem(lsKey, String(num));
    setEditandoSaldo(false);
  };

  // Agrupa eventos por dia + calcula saldo acumulado
  const linhas = useMemo(() => {
    const porDia = new Map<string, EventoFinanceiro[]>();
    for (const e of eventos) {
      const arr = porDia.get(e.data) ?? [];
      arr.push(e);
      porDia.set(e.data, arr);
    }
    const dias = Array.from(porDia.keys()).sort();
    let acumulado = saldoBanco;
    const out: { data: string; eventos: EventoFinanceiro[]; entradas: number; saidas: number; saldoDia: number; saldoAcum: number }[] = [];
    for (const d of dias) {
      const evs = porDia.get(d)!;
      const entradas = evs.filter(e => e.tipo === "entrada" && (e.pago || d >= range.dataAtual)).reduce((s, e) => s + e.valor, 0);
      const saidas = evs.filter(e => e.tipo === "saida").reduce((s, e) => s + e.valor, 0);
      const saldoDia = entradas - saidas;
      acumulado += saldoDia;
      // Entradas primeiro, saídas depois — dentro de cada grupo mantém ordem original
      const evsOrdenados = [
        ...evs.filter(e => e.tipo === "entrada"),
        ...evs.filter(e => e.tipo === "saida"),
      ];
      out.push({ data: d, eventos: evsOrdenados, entradas, saidas, saldoDia, saldoAcum: acumulado });
    }
    return out;
  }, [eventos, saldoBanco, range.dataAtual]);

  // Totais consolidados (soma exatamente os valores calculados na tabela)
  const totalEntradas = useMemo(() => linhas.reduce((s, l) => s + l.entradas, 0), [linhas]);
  const totalSaidas = useMemo(() => linhas.reduce((s, l) => s + l.saidas, 0), [linhas]);
  const atrasados = useMemo(() => eventos.filter(e => !e.pago && e.data < range.dataAtual && !e.isProvisao), [eventos, range.dataAtual]);
  const saldoFinal = linhas.length > 0 ? linhas[linhas.length - 1].saldoAcum : saldoBanco;

  const [diaExpandido, setDiaExpandido] = useState<string | null>(null);

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando fluxo...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* Barra de KPIs/controles */}
      <div className="m-kpi-grid" style={{
        display: "grid", gap: "12px",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}>
        {/* Saldo do banco editável */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>💳 Saldo Banco (hoje)</div>
          {editandoSaldo ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                <input type="text" inputMode="decimal" value={saldoInput} onChange={e => { setSaldoInput(e.target.value); setErroSaldo(""); }} autoFocus
                  style={{ ...inputStyle, padding: "4px 8px", fontSize: "14px" }} placeholder="1500,00" />
                <Btn type="button" size="xs" onClick={salvarSaldo}>OK</Btn>
                <Btn type="button" size="xs" variant="outline" onClick={() => { setEditandoSaldo(false); setErroSaldo(""); }}>✕</Btn>
              </div>
              {erroSaldo && <span style={{ fontSize: "11px", color: "#dc2626" }}>{erroSaldo}</span>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>{fmtBRL(saldoBanco)}</span>
                <Btn variant="outline" size="xs" onClick={() => { setSaldoInput(saldoBanco.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); setEditandoSaldo(true); }}>
                  Editar saldo
                </Btn>
              </div>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>Salvo neste aparelho (não sincroniza)</span>
            </div>
          )}
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>↑ Entradas Período</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#15803d" }}>{fmtBRL(totalEntradas)}</div>
        </div>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>↓ Saídas Período</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#b91c1c" }}>{fmtBRL(totalSaidas)}</div>
        </div>
        <div style={{ background: saldoFinal >= 0 ? "#eff6ff" : "#fef2f2", border: `1px solid ${saldoFinal >= 0 ? "#bfdbfe" : "#fecaca"}`, borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: saldoFinal >= 0 ? "#1e40af" : "#dc2626", textTransform: "uppercase" }}>Saldo Final Previsto</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: saldoFinal >= 0 ? "#1e3a8a" : "#991b1b" }}>{fmtBRL(saldoFinal)}</div>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["7d", "30d", "60d", "90d"] as Periodo[]).map(p => (
            <button key={p} type="button" onClick={() => setPeriodo(p)}
              style={{
                padding: "4px 12px", minHeight: "44px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
                background: periodo === p ? "#2563eb" : "#fff",
                color: periodo === p ? "#fff" : "#475569",
                border: "1px solid #cbd5e1", cursor: "pointer",
              }}>{p}</button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={incluirProvisao} onChange={e => setIncluirProvisao(e.target.checked)} />
          <span>Incluir provisão de manutenções previstas</span>
        </label>
        {atrasados.length > 0 && (
          <span style={{ marginLeft: "auto", padding: "4px 10px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
            ⚠ {atrasados.length} em atraso
          </span>
        )}
      </div>

      {/* Tabela do fluxo */}
      {linhas.length === 0
        ? <EmptyState icon="💸" message="Nenhum lançamento no período. Cadastre fretes, despesas ou recorrências." />
        : (
          <>
          <div className="m-hide">
          <DataTable count={eventos.length} label="lançamentos">
            <thead>
              <tr>
                <Th style={{ width: "90px" }}>Data</Th>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th style={{ textAlign: "right", color: "#16a34a" }}>Entrada</Th>
                <Th style={{ textAlign: "right", color: "#dc2626" }}>Saída</Th>
                <Th style={{ textAlign: "right" }}>Saldo Dia</Th>
                <Th style={{ textAlign: "right" }}>Acumulado</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <React.Fragment key={l.data}>
                  {/* Cabeçalho do dia */}
                  <tr
                    style={{
                      background: l.data === range.dataAtual
                        ? "#eff6ff"
                        : l.data < range.dataAtual
                          ? "#fff5f5"
                          : "#f1f5f9",
                      borderTop: "2px solid",
                      borderTopColor: l.data === range.dataAtual
                        ? "#3b82f6"
                        : l.data < range.dataAtual
                          ? "#fca5a5"
                          : "#cbd5e1",
                    }}
                  >
                    <Td colSpan={3} style={{ paddingTop: "8px", paddingBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "13px", letterSpacing: "0.01em" }}>
                          {fmtDate(l.data)}
                        </span>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {fmtDiaSemana(l.data)}
                        </span>
                        {l.data === range.dataAtual && <Badge variant="info">HOJE</Badge>}
                        {l.data < range.dataAtual && (
                          <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 600, background: "#fee2e2", padding: "1px 6px", borderRadius: "4px" }}>
                            atrasado
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600, paddingTop: "8px", paddingBottom: "6px" }}>{l.entradas > 0 ? fmtBRL(l.entradas) : ""}</Td>
                    <Td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600, paddingTop: "8px", paddingBottom: "6px" }}>{l.saidas > 0 ? fmtBRL(l.saidas) : ""}</Td>
                    <Td style={{ textAlign: "right", color: l.saldoDia >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700, paddingTop: "8px", paddingBottom: "6px" }}>{fmtBRL(l.saldoDia)}</Td>
                    <Td style={{ textAlign: "right", color: l.saldoAcum >= 0 ? "#1e293b" : "#dc2626", fontWeight: 700, background: l.saldoAcum < 0 ? "#fef2f2" : undefined, paddingTop: "8px", paddingBottom: "6px" }}>{fmtBRL(l.saldoAcum)}</Td>
                  </tr>
                  {/* Eventos do dia */}
                  {l.eventos.map(ev => {
                    const isEntradaAtrasada = ev.tipo === "entrada" && !ev.pago && ev.data < range.dataAtual;
                    return (
                      <Tr key={ev.id} muted={ev.isProvisao}>
                        <Td></Td>
                        <Td style={{ paddingLeft: "16px", fontSize: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {!ev.pago && !ev.isProvisao && ev.data < range.dataAtual && <span title="Em atraso">🔴</span>}
                            {ev.pago && <span title="Baixado">✓</span>}
                            <span style={{ 
                              color: isEntradaAtrasada ? "#64748b" : undefined,
                              fontStyle: isEntradaAtrasada ? "italic" : undefined
                            }}>{ev.descricao}</span>
                            {ev.contexto && <span style={{ color: "#94a3b8", fontSize: "10px" }}>• {ev.contexto}</span>}
                          </div>
                        </Td>
                        <Td>
                          <span style={{ fontSize: "10px", color: isEntradaAtrasada ? "#94a3b8" : CAT_COR[ev.categoria], fontWeight: 600 }}>
                            {CAT_LABEL[ev.categoria]}
                          </span>
                        </Td>
                        <Td style={{ 
                          textAlign: "right", 
                          color: ev.tipo === "entrada" ? (isEntradaAtrasada ? "#94a3b8" : "#16a34a") : "",
                          textDecoration: isEntradaAtrasada ? "line-through" : undefined,
                          fontSize: "12px" 
                        }}>
                          {ev.tipo === "entrada" ? (
                            <span title={isEntradaAtrasada ? "Entrada em atraso (não contabilizada no saldo acumulado)" : undefined}>
                              {fmtBRL(ev.valor)}
                            </span>
                          ) : ""}
                        </Td>
                        <Td style={{ textAlign: "right", color: "#dc2626", fontSize: "12px" }}>
                          {ev.tipo === "saida" ? fmtBRL(ev.valor) : ""}
                        </Td>
                        <Td></Td>
                        <Td></Td>
                      </Tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: daily cards */}
          <MobileList count={eventos.length} label="lançamentos">
            {linhas.map(l => {
              const expandido = diaExpandido === l.data;
              return (
                <div key={l.data} style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  <MobileCard
                    title={`${fmtDate(l.data)} ${fmtDiaSemana(l.data)}`}
                    subtitle={`${l.eventos.length} lançamento(s)`}
                    badge={
                      l.data === range.dataAtual ? <Badge variant="info">HOJE</Badge>
                      : l.data < range.dataAtual ? <Badge variant="danger">Passado</Badge>
                      : <Badge variant="default">Futuro</Badge>
                    }
                    highlight={l.saldoDia >= 0 ? "#16a34a" : "#dc2626"}
                    details={[
                      { label: "Entradas", value: l.entradas > 0 ? fmtBRL(l.entradas) : "—" },
                      { label: "Saídas", value: l.saidas > 0 ? fmtBRL(l.saidas) : "—" },
                      { label: "Saldo Dia", value: fmtBRL(l.saldoDia) },
                      { label: "Acumulado", value: fmtBRL(l.saldoAcum) },
                    ]}
                    actions={
                      <Btn variant="ghost" size="xs" onClick={() => setDiaExpandido(expandido ? null : l.data)}>
                        {expandido ? "▴ Ocultar lançamentos" : "▾ Ver lançamentos"}
                      </Btn>
                    }
                  />
                  {expandido && (
                    <div style={{ background: "#f8fafc", borderRadius: "0 0 10px 10px", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid #e2e8f0", borderTop: "none" }}>
                      {l.eventos.map(ev => {
                        const atrasado = !ev.pago && ev.data < range.dataAtual && !ev.isProvisao;
                        return (
                          <div key={ev.id} style={{
                            display: "flex", alignItems: "center", gap: "8px",
                            fontSize: "12px", padding: "4px 0", borderBottom: "1px solid #f1f5f9",
                          }}>
                            <span style={{
                              width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                              background: ev.tipo === "entrada" ? "#16a34a" : "#dc2626",
                              opacity: ev.isProvisao ? 0.4 : 1,
                            }} />
                            <span style={{
                              flex: 1, color: atrasado ? "#94a3b8" : "#1e293b",
                              fontStyle: ev.isProvisao ? "italic" : "normal",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }} title={ev.descricao}>{ev.descricao}</span>
                            <span style={{
                              fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
                              color: ev.tipo === "entrada" ? (atrasado ? "#94a3b8" : "#16a34a") : "#dc2626",
                              textDecoration: atrasado ? "line-through" : undefined,
                            }}>{ev.tipo === "entrada" ? "+" : "-"}{fmtBRL(ev.valor)}</span>
                            {!ev.pago && !ev.isProvisao && (
                              <span style={{ fontSize: "10px", color: atrasado ? "#dc2626" : "#d97706", flexShrink: 0 }}>
                                {atrasado ? "🔴" : "⏳"}
                              </span>
                            )}
                            {ev.pago && <span style={{ fontSize: "10px", color: "#16a34a", flexShrink: 0 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </MobileList>
          </>
        )}
    </div>
  );
}

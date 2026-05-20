"use client";
import { useState, useEffect, useMemo } from "react";
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

export default function FluxoTab({ empresaId }: { empresaId: string }) {
  const supabase = createClient();
  const [eventos, setEventos] = useState<EventoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [incluirProvisao, setIncluirProvisao] = useState(true);

  // Saldo do banco (persistido em localStorage por empresa)
  const lsKey = `saldoBanco:${empresaId}`;
  const [saldoBanco, setSaldoBanco] = useState<number>(0);
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState("");

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(lsKey) : null;
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
      empresaId,
      inicio: range.inicio,
      fim: range.fim,
      incluirProvisaoManutencao: incluirProvisao,
    }).catch(e => { setErro(e.message ?? String(e)); return []; });
    setEventos(evs);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    carregar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, periodo, incluirProvisao]);

  const salvarSaldo = () => {
    const num = parseFloat(saldoInput);
    if (isNaN(num)) return;
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

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando fluxo...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* Barra de KPIs/controles */}
      <div style={{
        display: "grid", gap: "12px",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}>
        {/* Saldo do banco editável */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>💳 Saldo Banco (hoje)</div>
          {editandoSaldo ? (
            <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
              <input type="number" step="0.01" value={saldoInput} onChange={e => setSaldoInput(e.target.value)} autoFocus
                style={{ ...inputStyle, padding: "4px 8px", fontSize: "14px" }} />
              <Btn type="button" size="xs" onClick={salvarSaldo}>OK</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>{fmtBRL(saldoBanco)}</span>
              <button type="button" onClick={() => { setSaldoInput(String(saldoBanco)); setEditandoSaldo(true); }}
                style={{ background: "transparent", border: "none", color: "#2563eb", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}>editar</button>
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
                padding: "4px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
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
                <>
                  {/* Cabeçalho do dia */}
                  <tr
                    key={`hd:${l.data}`}
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
                </>
              ))}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: daily cards */}
          <MobileList count={eventos.length} label="lançamentos">
            {linhas.map(l => (
              <MobileCard
                key={l.data}
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
              />
            ))}
          </MobileList>
          </>
        )}
    </div>
  );
}

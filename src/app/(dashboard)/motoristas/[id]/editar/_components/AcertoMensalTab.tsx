"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormSection, Btn, Alert, inputStyle, selectStyle, Th } from "@/components/ui/ds";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtMoeda = (v: number) => "R$ " + (v || 0).toFixed(2).replace(".", ",");

export function AcertoMensalTab({ motoristaId }: { motoristaId: string }) {
  const supabase = createClient();
  const [refDate, setRefDate] = useState(startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  
  const [acerto, setAcerto] = useState<any>(null);
  const [fretes, setFretes] = useState<any[]>([]);
  const [ajustes, setAjustes] = useState<any[]>([]);
  const [motorista, setMotorista] = useState<any>(null);

  const [modalStep, setModalStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form for new ajuste
  const [novoAjuste, setNovoAjuste] = useState({ tipo: "desconto", descricao: "", valor: "", parcelas: "1" });

  // Frete Modal state
  const [freteModalOpen, setFreteModalOpen] = useState(false);
  const [freteEditing, setFreteEditing] = useState<any>(null);

  // Frete Sorting state
  const [freteSortKey, setFreteSortKey] = useState<string>("data_fim");
  const [freteSortDirection, setFreteSortDirection] = useState<"asc" | "desc">("desc");

  const handleFreteSort = (key: string) => {
    if (freteSortKey === key) {
      setFreteSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setFreteSortKey(key);
      setFreteSortDirection("desc");
    }
  };

  const loadData = async () => {
    setLoading(true);
    const dateStr = format(refDate, "yyyy-MM-dd");
    const endStr = format(endOfMonth(refDate), "yyyy-MM-dd");

    // Load motorista for PIX info
    const { data: mot } = await supabase.from("motoristas").select("chave_pix, tipo_chave_pix, nome, salario_fixo, tipo_comissao").eq("id", motoristaId).single();
    setMotorista(mot);

    // Load acerto
    let { data: acData } = await supabase.from("acertos_motorista")
      .select("*")
      .eq("motorista_id", motoristaId)
      .eq("mes_referencia", dateStr)
      .single();

    let ac: any = acData;

    if (!ac) {
      ac = { id: null, status: "aberto", saldo_anterior: 0, observacoes: "" };
      const { data: prevAc } = await supabase.from("acertos_motorista")
        .select("valor_final")
        .eq("motorista_id", motoristaId)
        .eq("mes_referencia", format(subMonths(refDate, 1), "yyyy-MM-dd"))
        .single();
      if (prevAc && prevAc.valor_final && prevAc.valor_final < 0) {
        ac.saldo_anterior = prevAc.valor_final;
      }
    }
    setAcerto(ac);

    // Load ajustes
    let initialAjustes: any[] = [];
    if (ac?.id) {
      const { data: aj } = await supabase.from("acerto_ajustes").select("*").eq("acerto_id", ac.id);
      initialAjustes = aj || [];
    } else {
      if (mot && mot.salario_fixo && mot.salario_fixo > 0 && mot.tipo_comissao?.includes("salario")) {
        initialAjustes.push({
          id: "tmp_salario",
          tipo: "bonus",
          descricao: "Salário Fixo Mensal",
          valor: Number(mot.salario_fixo),
          parcela_atual: 1,
          total_parcelas: 1
        });
      }
    }
    setAjustes(initialAjustes);

    // Load Fretes
    const { data: fr } = await supabase.from("fretes")
      .select(`
        id, origem, destino, data_fim, pago, comissao_motorista_valor, comissao_quitada,
        acerto_fretes ( valor, status, observacoes, acerto_id, acertos_motorista ( id, mes_referencia ) )
      `)
      .eq("motorista_id", motoristaId)
      .eq("status", "concluido")
      .lte("data_fim", endStr + "T23:59:59Z");

    const mappedFr = (fr || []).map(f => {
      const historico = f.acerto_fretes?.filter((x: any) => x.acerto_id !== ac?.id) || [];
      const pagoAnterior = historico.reduce((acc: number, curr: any) => acc + Number(curr.valor || 0), 0);
      const saldoPendente = Number(f.comissao_motorista_valor || 0) - pagoAnterior;
      const acf = f.acerto_fretes?.find((x: any) => x.acerto_id === ac?.id);
      
      let st = "aguardando";
      let vPagar = 0;
      let acaoResto = "rolar";
      let obs = "";

      if (acf) {
        st = acf.status;
        vPagar = Number(acf.valor || 0);
        obs = acf.observacoes || "";
        if (f.comissao_quitada && vPagar < saldoPendente) acaoResto = "quitar";
      } else {
        if (f.pago) {
          st = "incluido";
          vPagar = saldoPendente;
        }
      }

      return {
        ...f,
        historico,
        pago_anterior: pagoAnterior,
        saldo_pendente: saldoPendente,
        acerto_status: st,
        valor_pagar_agora: vPagar,
        acao_resto: acaoResto,
        observacao_pagamento: obs,
      };
    }).filter(f => {
      if (!f.acerto_fretes?.find((x: any) => x.acerto_id === ac?.id) && f.comissao_quitada) return false;
      if (f.saldo_pendente <= 0 && !f.acerto_fretes?.find((x: any) => x.acerto_id === ac?.id)) return false;
      return true;
    });

    setFretes(mappedFr);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate, motoristaId]);

  const totais = useMemo(() => {
    let fretesVal = 0;
    fretes.forEach(f => { 
      if (f.acerto_status === "incluido") fretesVal += Number(f.valor_pagar_agora || 0); 
    });
    let ajustesVal = 0;
    ajustes.forEach(a => {
      const v = Number(a.valor);
      if (a.tipo === "bonus" || a.tipo === "reembolso") ajustesVal += v;
      else ajustesVal -= v;
    });
    const final = (Number(acerto?.saldo_anterior || 0)) + fretesVal + ajustesVal;
    return { fretes: fretesVal, ajustes: ajustesVal, final };
  }, [fretes, ajustes, acerto]);

  const sortedFretes = useMemo(() => {
    return [...fretes].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (freteSortKey === "rota") {
        valA = `${a.origem || ""} ${a.destino || ""}`.toLowerCase();
        valB = `${b.origem || ""} ${b.destino || ""}`.toLowerCase();
      } else if (freteSortKey === "data_fim") {
        valA = a.data_fim ? new Date(a.data_fim).getTime() : 0;
        valB = b.data_fim ? new Date(b.data_fim).getTime() : 0;
      } else if (freteSortKey === "saldo_pendente") {
        valA = Number(a.saldo_pendente || 0);
        valB = Number(b.saldo_pendente || 0);
      } else if (freteSortKey === "valor_pagar_agora") {
        valA = Number(a.valor_pagar_agora || 0);
        valB = Number(b.valor_pagar_agora || 0);
      } else if (freteSortKey === "acerto_status") {
        valA = a.acerto_status === "incluido" ? 1 : 0;
        valB = b.acerto_status === "incluido" ? 1 : 0;
      }

      if (valA < valB) return freteSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return freteSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [fretes, freteSortKey, freteSortDirection]);

  const sortedAjustes = useMemo(() => {
    return [...ajustes].sort((a, b) => {
      const aIsSalario = a.id === "tmp_salario" || a.descricao?.toLowerCase().includes("salário") || a.descricao?.toLowerCase().includes("salario");
      const bIsSalario = b.id === "tmp_salario" || b.descricao?.toLowerCase().includes("salário") || b.descricao?.toLowerCase().includes("salario");
      if (aIsSalario && !bIsSalario) return -1;
      if (!aIsSalario && bIsSalario) return 1;
      return 0;
    });
  }, [ajustes]);

  const prevMonth = () => setRefDate(subMonths(refDate, 1));
  const nextMonth = () => setRefDate(addMonths(refDate, 1));

  const addAjuste = () => {
    if (!novoAjuste.descricao || !novoAjuste.valor) return;
    setAjustes([...ajustes, { 
      id: "tmp_" + Date.now(),
      tipo: novoAjuste.tipo,
      descricao: novoAjuste.descricao,
      valor: parseFloat(novoAjuste.valor),
      parcela_atual: 1,
      total_parcelas: parseInt(novoAjuste.parcelas) || 1
    }]);
    setNovoAjuste({ tipo: "desconto", descricao: "", valor: "", parcelas: "1" });
  };

  const removeAjuste = (id: string) => setAjustes(ajustes.filter(a => a.id !== id));

  const openFreteModal = (f: any) => {
    setFreteEditing({ ...f, edit_valor: f.valor_pagar_agora });
    setFreteModalOpen(true);
  };

  const saveFreteModal = () => {
    if (!freteEditing) return;
    const v = parseFloat(freteEditing.edit_valor) || 0;
    const isIncluded = v > 0 || freteEditing.acao_resto === "quitar";
    
    setFretes(fretes.map(f => {
      if (f.id !== freteEditing.id) return f;
      return {
        ...f,
        valor_pagar_agora: v,
        acerto_status: isIncluded ? "incluido" : "aguardando",
        acao_resto: freteEditing.acao_resto,
        observacao_pagamento: freteEditing.observacao_pagamento
      };
    }));
    setFreteModalOpen(false);
  };

  const fecharAcerto = async (pagarAgora: boolean) => {
    setSaving(true);
    let acId = acerto?.id;
    
    if (!acId) {
      const { data, error } = await supabase.from("acertos_motorista").insert({
        motorista_id: motoristaId,
        mes_referencia: format(refDate, "yyyy-MM-dd"),
        status: pagarAgora ? "fechado" : "agendado",
        data_pagamento: pagarAgora ? format(new Date(), "yyyy-MM-dd") : null,
        saldo_anterior: acerto.saldo_anterior,
        total_fretes: totais.fretes,
        total_ajustes: totais.ajustes,
        valor_final: totais.final,
        observacoes: acerto.observacoes
      }).select("id").single();
      if (error) { alert("Erro ao criar acerto: " + error.message); setSaving(false); return; }
      acId = data.id;
    } else {
      await supabase.from("acertos_motorista").update({
        status: pagarAgora ? "fechado" : "agendado",
        data_pagamento: pagarAgora ? format(new Date(), "yyyy-MM-dd") : null,
        total_fretes: totais.fretes,
        total_ajustes: totais.ajustes,
        valor_final: totais.final,
        observacoes: acerto.observacoes
      }).eq("id", acId);
      await supabase.from("acerto_ajustes").delete().eq("acerto_id", acId);
      await supabase.from("acerto_fretes").delete().eq("acerto_id", acId);
    }

    if (ajustes.length > 0) {
      const ajToIns = ajustes.map(a => ({
        acerto_id: acId,
        tipo: a.tipo,
        descricao: a.descricao,
        valor: a.valor,
        parcela_atual: a.parcela_atual,
        total_parcelas: a.total_parcelas
      }));
      await supabase.from("acerto_ajustes").insert(ajToIns);
    }

    const frToIns = fretes.filter(f => f.acerto_status === "incluido").map(f => ({
      acerto_id: acId,
      frete_id: f.id,
      valor: f.valor_pagar_agora || 0,
      status: f.acerto_status,
      observacoes: f.observacao_pagamento || ""
    }));
    
    if (frToIns.length > 0) {
      await supabase.from("acerto_fretes").insert(frToIns);
    }

    // Process quitação
    for (const f of fretes) {
      if (f.acerto_status === "incluido") {
        if (f.acao_resto === "quitar" || f.valor_pagar_agora >= f.saldo_pendente) {
          await supabase.from("fretes").update({ comissao_quitada: true }).eq("id", f.id);
        } else {
          await supabase.from("fretes").update({ comissao_quitada: false }).eq("id", f.id);
        }
      }
    }

    setSaving(false);
    setModalStep(3); 
    loadData();
  };

  const monthLabel = format(refDate, "MMMM yyyy", { locale: ptBR }).toUpperCase();
  const isFechado = acerto?.status === "fechado";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* DATE PICKER PANEL */}
      {(() => {
        const currentYear = new Date().getFullYear();
        // 6 anos em ordem crescente (mais antigo → mais recente)
        const allYears = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
        const yearsFirst = allYears.slice(0, 3);  // ex: 2021 2022 2023
        const yearsSecond = allYears.slice(3);    // ex: 2024 2025 2026
        const selectedYear = refDate.getFullYear();
        const selectedMonth = refDate.getMonth() + 1;
        const monthsFirst = [1, 2, 3, 4, 5, 6];
        const monthsSecond = [7, 8, 9, 10, 11, 12];

        const selectDate = (year: number, month: number) => {
          setRefDate(startOfMonth(new Date(year, month - 1, 1)));
        };

        const chipBase: React.CSSProperties = {
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          border: "1px solid transparent",
          transition: "all 120ms",
          userSelect: "none",
        };
        const chipInactive: React.CSSProperties = {
          ...chipBase,
          background: "#f1f5f9",
          color: "#475569",
          borderColor: "#e2e8f0",
        };
        const chipActive: React.CSSProperties = {
          ...chipBase,
          background: "#1e40af",
          color: "#fff",
          borderColor: "#1e40af",
        };

        return (
          <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
          }}>
            {/* ANOS — dois blocos de 3 em ordem crescente */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Ano</div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                {yearsFirst.map(y => (
                  <span
                    key={y}
                    style={y === selectedYear ? chipActive : chipInactive}
                    onClick={() => selectDate(y, selectedMonth)}
                  >
                    {y}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {yearsSecond.map(y => (
                  <span
                    key={y}
                    style={y === selectedYear ? chipActive : chipInactive}
                    onClick={() => selectDate(y, selectedMonth)}
                  >
                    {y}
                  </span>
                ))}
              </div>
            </div>

            {/* DIVISOR */}
            <div style={{ width: "1px", height: "44px", background: "#e2e8f0" }} />

            {/* MESES 01-06 */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Mês</div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                {monthsFirst.map(m => (
                  <span
                    key={m}
                    style={m === selectedMonth ? chipActive : chipInactive}
                    onClick={() => selectDate(selectedYear, m)}
                  >
                    {String(m).padStart(2, "0")}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {monthsSecond.map(m => (
                  <span
                    key={m}
                    style={m === selectedMonth ? chipActive : chipInactive}
                    onClick={() => selectDate(selectedYear, m)}
                  >
                    {String(m).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            {/* DIVISOR */}
            <div style={{ width: "1px", height: "44px", background: "#e2e8f0" }} />

            {/* MÊS SELECIONADO */}
            <div style={{
              background: "#1e40af",
              color: "#fff",
              borderRadius: "8px",
              padding: "8px 18px",
              fontWeight: 700,
              fontSize: "15px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(30,64,175,0.25)",
            }}>
              {format(refDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </div>
          </div>
        );
      })()}

      {isFechado && <Alert variant="success">Este acerto já foi finalizado e pago.</Alert>}
      {acerto?.status === "agendado" && <Alert variant="warning">Este acerto está agendado mas ainda não foi pago.</Alert>}

      <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        
        {/* LEFT COLUMN: Fretes & Ajustes */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <FormSection title="Comissões de Fretes">
            {fretes.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "14px" }}>Nenhum frete pendente neste período.</p>
            ) : (
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <Th 
                      sortKey="rota" 
                      activeSortKey={freteSortKey} 
                      sortDirection={freteSortDirection} 
                      onSort={handleFreteSort}
                      style={{ padding: "8px" }}
                    >
                      Rota
                    </Th>
                    <Th 
                      sortKey="data_fim" 
                      activeSortKey={freteSortKey} 
                      sortDirection={freteSortDirection} 
                      onSort={handleFreteSort}
                      style={{ padding: "8px" }}
                    >
                      Data Fim
                    </Th>
                    <Th 
                      sortKey="saldo_pendente" 
                      activeSortKey={freteSortKey} 
                      sortDirection={freteSortDirection} 
                      onSort={handleFreteSort}
                      style={{ padding: "8px", textAlign: "right" }}
                    >
                      Saldo Restante
                    </Th>
                    <Th
                      sortKey="valor_pagar_agora"
                      activeSortKey={freteSortKey}
                      sortDirection={freteSortDirection}
                      onSort={handleFreteSort}
                      style={{ padding: "8px", textAlign: "right" }}
                    >
                      Pagar Agora
                    </Th>
                    <Th
                      sortKey="acerto_status"
                      activeSortKey={freteSortKey}
                      sortDirection={freteSortDirection}
                      onSort={handleFreteSort}
                      style={{ padding: "8px", textAlign: "center" }}
                    >
                      Ação
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFretes.map(f => {
                    const incl = f.acerto_status === "incluido";
                    return (
                      <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px" }}>{f.origem?.split("-")[0]} → {f.destino?.split("-")[0]}</td>
                        <td style={{ padding: "8px" }}>{f.data_fim ? format(new Date(f.data_fim), "dd/MM") : ""}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: "#64748b" }}>
                          {fmtMoeda(f.saldo_pendente)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>
                          {incl ? fmtMoeda(f.valor_pagar_agora) : "-"}
                          {f.acao_resto === "quitar" && <div style={{ fontSize: "10px", color: "#16a34a" }}>Quitado</div>}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                            {!isFechado ? (
                              <>
                                <button type="button" onClick={() => openFreteModal(f)} style={{ fontSize: "12px", background: "#e2e8f0", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: 500, color: "#334155" }}>
                                  Ajustar
                                </button>
                                <input 
                                  type="checkbox" 
                                  checked={incl} 
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFretes(fretes.map(x => {
                                      if (x.id !== f.id) return x;
                                      return {
                                        ...x,
                                        acerto_status: checked ? "incluido" : "aguardando",
                                        valor_pagar_agora: checked ? x.saldo_pendente : 0
                                      };
                                    }));
                                  }}
                                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                                  title={incl ? "Remover do pagamento" : "Selecionar para pagar"}
                                />
                              </>
                            ) : (
                              <input 
                                type="checkbox" 
                                checked={incl} 
                                disabled 
                                style={{ width: "16px", height: "16px" }}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </FormSection>
 
          <FormSection title="Ajustes (Adiantamentos, Bônus, Descontos)">
            {ajustes.length > 0 && (
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse", marginBottom: "16px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "8px" }}>Tipo</th>
                    <th style={{ padding: "8px" }}>Descrição</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Valor</th>
                    <th style={{ padding: "8px", textAlign: "center" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAjustes.map(a => {
                    const isPos = a.tipo === "bonus" || a.tipo === "reembolso";
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px", textTransform: "capitalize" }}>{a.tipo}</td>
                        <td style={{ padding: "8px" }}>{a.descricao} {a.total_parcelas > 1 ? `(${a.parcela_atual}/${a.total_parcelas})` : ""}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: isPos ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {isPos ? "+" : "-"}{fmtMoeda(a.valor)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {!isFechado && (
                            <button type="button" onClick={() => removeAjuste(a.id)} style={{ fontSize: "12px", color: "#dc2626", background: "transparent", border: "none", cursor: "pointer" }}>Excluir</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {!isFechado && (
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", background: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Tipo</label>
                  <select value={novoAjuste.tipo} onChange={e => setNovoAjuste({...novoAjuste, tipo: e.target.value})} style={selectStyle}>
                    <option value="desconto">Desconto</option>
                    <option value="bonus">Bônus</option>
                    <option value="reembolso">Reembolso</option>
                    <option value="emprestimo">Empréstimo (Retenção)</option>
                    <option value="multa">Multa</option>
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Descrição</label>
                  <input value={novoAjuste.descricao} onChange={e => setNovoAjuste({...novoAjuste, descricao: e.target.value})} style={inputStyle} placeholder="Ex: Adiantamento viagem 123" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Valor (R$)</label>
                  <input type="number" step="0.01" value={novoAjuste.valor} onChange={e => setNovoAjuste({...novoAjuste, valor: e.target.value})} style={inputStyle} placeholder="0.00" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Parcelas</label>
                  <input type="number" min="1" value={novoAjuste.parcelas} onChange={e => setNovoAjuste({...novoAjuste, parcelas: e.target.value})} style={inputStyle} />
                </div>
                <Btn type="button" onClick={addAjuste}>Adicionar</Btn>
              </div>
            )}
          </FormSection>

        </div>

        {/* RIGHT COLUMN: Resumo */}
        <div>
          <div style={{ background: "#0f172a", color: "#fff", padding: "24px", borderRadius: "12px", position: "sticky", top: "24px" }}>
            <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 500, color: "#94a3b8" }}>Resumo do Mês</h4>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
              <span style={{ color: "#cbd5e1" }}>Saldo Anterior:</span>
              <span style={{ color: (acerto?.saldo_anterior || 0) < 0 ? "#ef4444" : "#fff" }}>{fmtMoeda(acerto?.saldo_anterior || 0)}</span>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
              <span style={{ color: "#cbd5e1" }}>Total de Fretes:</span>
              <span style={{ color: "#4ade80" }}>+{fmtMoeda(totais.fretes)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px", borderBottom: "1px solid #334155", paddingBottom: "12px" }}>
              <span style={{ color: "#cbd5e1" }}>Total de Ajustes:</span>
              <span style={{ color: totais.ajustes < 0 ? "#ef4444" : "#4ade80" }}>
                {totais.ajustes > 0 ? "+" : ""}{fmtMoeda(totais.ajustes)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px", fontSize: "18px", fontWeight: 700 }}>
              <span>Total a Pagar:</span>
              <span style={{ color: totais.final < 0 ? "#ef4444" : "#fff" }}>{fmtMoeda(totais.final)}</span>
            </div>

            {!isFechado && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <textarea 
                  value={acerto?.observacoes || ""} 
                  onChange={e => setAcerto({...acerto, observacoes: e.target.value})}
                  placeholder="Observações do fechamento..."
                  style={{ ...inputStyle, minHeight: "80px", background: "#1e293b", color: "#fff", borderColor: "#334155" }}
                />
                <Btn type="button" variant="primary" onClick={() => setModalStep(1)} style={{ width: "100%", justifyContent: "center" }}>
                  Fechar Acerto
                </Btn>
              </div>
            )}
            
            {isFechado && (
              <Btn type="button" variant="outline" onClick={() => setModalStep(3)} style={{ width: "100%", justifyContent: "center", background: "transparent", color: "#fff", borderColor: "#334155" }}>
                Ver Recibo (PDF)
              </Btn>
            )}
          </div>
        </div>

      </div>

      {/* POPUP: AJUSTE DE FRETE */}
      {freteModalOpen && freteEditing && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "500px", maxWidth: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", overflow: "hidden" }}>
            <div style={{ padding: "24px" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>Ajustar Pagamento do Frete</h3>
              <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>
                Rota: {freteEditing.origem?.split("-")[0]} → {freteEditing.destino?.split("-")[0]} <br/>
                Total Original: {fmtMoeda(freteEditing.comissao_motorista_valor)}
              </p>

              {freteEditing.historico.length > 0 && (
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#334155" }}>Histórico de Pagamentos</h4>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "13px", color: "#64748b" }}>
                    {freteEditing.historico.map((h: any, i: number) => (
                      <li key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span>Acerto: {h.acertos_motorista?.mes_referencia ? format(new Date(h.acertos_motorista.mes_referencia), "MM/yyyy") : "Antigo"}</span>
                        <span style={{ color: "#16a34a" }}>{fmtMoeda(h.valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e2e8f0", fontWeight: 600 }}>
                    <span>Saldo Restante:</span>
                    <span>{fmtMoeda(freteEditing.saldo_pendente)}</span>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "14px", fontWeight: 500, color: "#334155", display: "block", marginBottom: "8px" }}>
                  Valor a Pagar Agora (R$)
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  style={{ ...inputStyle, fontSize: "16px", padding: "12px" }}
                  value={freteEditing.edit_valor} 
                  onChange={e => setFreteEditing({...freteEditing, edit_valor: e.target.value})}
                />
              </div>

              {Number(freteEditing.edit_valor || 0) < freteEditing.saldo_pendente && (
                <div style={{ marginBottom: "16px", background: "#fef2f2", padding: "12px", borderRadius: "8px", border: "1px solid #fecaca" }}>
                  <label style={{ fontSize: "14px", fontWeight: 500, color: "#991b1b", display: "block", marginBottom: "8px" }}>
                    O valor é menor que o saldo. O que fazer com o resto?
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", marginBottom: "8px", cursor: "pointer" }}>
                    <input type="radio" name="acaoResto" checked={freteEditing.acao_resto === "rolar"} onChange={() => setFreteEditing({...freteEditing, acao_resto: "rolar"})} />
                    Deixar para o próximo mês
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                    <input type="radio" name="acaoResto" checked={freteEditing.acao_resto === "quitar"} onChange={() => setFreteEditing({...freteEditing, acao_resto: "quitar"})} />
                    Não vou pagar o restante (Perdoar/Quitar frete)
                  </label>
                </div>
              )}

              <div style={{ marginBottom: "24px" }}>
                <label style={{ fontSize: "14px", fontWeight: 500, color: "#334155", display: "block", marginBottom: "8px" }}>
                  Observações (Opcional)
                </label>
                <input 
                  type="text" 
                  style={inputStyle}
                  placeholder="Ex: Desconto por avaria na carga..."
                  value={freteEditing.observacao_pagamento || ""} 
                  onChange={e => setFreteEditing({...freteEditing, observacao_pagamento: e.target.value})}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <Btn type="button" variant="outline" onClick={() => setFreteModalOpen(false)}>Cancelar</Btn>
                <Btn type="button" variant="primary" onClick={saveFreteModal}>Salvar Pagamento</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FECHAMENTO (3 STEPS) */}
      {modalStep > 0 && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "500px", maxWidth: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", overflow: "hidden" }}>
            
            {/* Step 1: Resumo */}
            {modalStep === 1 && (
              <div style={{ padding: "24px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Revisão do Acerto</h3>
                <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>
                  Verifique os valores antes de prosseguir. Lembre-se que saldos não pagos marcados para "rolar" irão para o próximo mês.
                </p>
                
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "#64748b" }}>Motorista:</span>
                    <span style={{ fontWeight: 600 }}>{motorista?.nome}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "#64748b" }}>Mês Ref:</span>
                    <span style={{ fontWeight: 600 }}>{monthLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "18px", fontWeight: 700 }}>
                    <span>Valor a Pagar:</span>
                    <span style={{ color: totais.final < 0 ? "#dc2626" : "#16a34a" }}>{fmtMoeda(totais.final)}</span>
                  </div>
                  {totais.final < 0 && (
                    <p style={{ fontSize: "12px", color: "#dc2626", marginTop: "8px" }}>
                      * O motorista possui saldo devedor. Este valor será lançado como Saldo Anterior negativo no próximo mês.
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <Btn type="button" variant="outline" onClick={() => setModalStep(0)}>Cancelar</Btn>
                  <Btn type="button" variant="primary" onClick={() => setModalStep(2)}>Avançar para Pagamento →</Btn>
                </div>
              </div>
            )}

            {/* Step 2: Pagamento */}
            {modalStep === 2 && (
              <div style={{ padding: "24px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Dados de Pagamento (PIX)</h3>
                
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px", marginBottom: "24px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", color: "#166534", marginBottom: "8px" }}>Chave PIX do Motorista</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#166534" }}>{motorista?.chave_pix || "NÃO CADASTRADA"}</div>
                  <div style={{ fontSize: "12px", color: "#166534", marginTop: "4px", textTransform: "uppercase" }}>Tipo: {motorista?.tipo_chave_pix}</div>
                </div>

                <div style={{ display: "flex", gap: "12px", flexDirection: "column" }}>
                  {/* BOTÃO PRINCIPAL: Confirmar Pagamento */}
                  <button
                    type="button"
                    onClick={() => fecharAcerto(true)}
                    disabled={saving}
                    style={{
                      width: "100%",
                      padding: "16px 24px",
                      borderRadius: "10px",
                      border: "none",
                      background: saving ? "#86efac" : "#16a34a",
                      color: "#fff",
                      fontSize: "16px",
                      fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      boxShadow: saving ? "none" : "0 4px 14px rgba(22,163,74,0.4)",
                      transition: "all 150ms",
                      letterSpacing: "0.01em",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>✅</span>
                    {saving ? "Processando..." : "Confirmar que já paguei — Finalizar"}
                  </button>

                  {/* BOTÃO SECUNDÁRIO: Apenas Agendar */}
                  <button
                    type="button"
                    onClick={() => fecharAcerto(false)}
                    disabled={saving}
                    style={{
                      width: "100%",
                      padding: "14px 24px",
                      borderRadius: "10px",
                      border: "2px solid #f59e0b",
                      background: "#fffbeb",
                      color: "#92400e",
                      fontSize: "15px",
                      fontWeight: 600,
                      cursor: saving ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      transition: "all 150ms",
                    }}
                  >
                    <span style={{ fontSize: "18px" }}>🕐</span>
                    Apenas Agendar — Deixar pendente
                  </button>

                  {/* VOLTAR */}
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    style={{
                      background: "transparent",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      color: "#64748b",
                      fontSize: "14px",
                      padding: "10px",
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    ← Voltar à revisão
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: PDF / WhatsApp */}
            {modalStep === 3 && (
              <div style={{ padding: "24px", textAlign: "center" }}>
                <div style={{ width: "64px", height: "64px", background: "#dcfce7", color: "#16a34a", borderRadius: "32px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", margin: "0 auto 16px" }}>
                  ✓
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "20px" }}>Acerto Concluído!</h3>
                <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>
                  O acerto do mês de {monthLabel} foi registrado com sucesso.
                </p>

                <div style={{ display: "flex", gap: "12px", flexDirection: "column" }}>
                  <Btn type="button" variant="primary" style={{ justifyContent: "center" }} onClick={() => alert("Geração de PDF será implementada na próxima versão.")}>
                    📄 Visualizar Recibo PDF
                  </Btn>
                  <Btn type="button" variant="outline" style={{ justifyContent: "center", opacity: 0.5 }} disabled title="Aguardando aprovação da Meta">
                    💬 Enviar via WhatsApp (Em breve)
                  </Btn>
                  <Btn type="button" variant="ghost" onClick={() => setModalStep(0)} style={{ justifyContent: "center", marginTop: "8px" }}>
                    Fechar
                  </Btn>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

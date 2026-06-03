"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormSection, Btn, Alert, inputStyle, selectStyle } from "@/components/ui/ds";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtMoeda = (v: number) => "R$ " + (v || 0).toFixed(2).replace(".", ",");

type Acerto = {
  id: string | null;
  status: string;
  saldo_anterior: number;
  observacoes: string;
};

type Ajuste = {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  parcela_atual: number;
  total_parcelas: number;
};

type Motorista = {
  chave_pix: string | null;
  tipo_chave_pix: string | null;
  nome: string;
  salario_fixo: number | null;
  valor_diaria_por_pedido: number | null;
};

type PedidoConcluido = {
  id: string;
  data_fim_real: string | null;
  data_inicio_real: string | null;
};

type Adiantamento = {
  id: string;
  valor: number;
  data_pagamento: string | null;
  justificativa: string | null;
};

export function AcertoMensalTab({ motoristaId }: { motoristaId: string }) {
  const supabase = createClient();
  const [refDate, setRefDate] = useState(startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);

  const [acerto, setAcerto] = useState<Acerto | null>(null);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [pedidosMes, setPedidosMes] = useState<PedidoConcluido[]>([]);
  const [adiantamentosMes, setAdiantamentosMes] = useState<Adiantamento[]>([]);

  const [modalStep, setModalStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form for new ajuste
  const [novoAjuste, setNovoAjuste] = useState({ tipo: "desconto", descricao: "", valor: "", parcelas: "1" });

  const loadData = async () => {
    setLoading(true);
    const dateStr = format(refDate, "yyyy-MM-dd");
    const startStr = format(startOfMonth(refDate), "yyyy-MM-dd");
    const endStr = format(endOfMonth(refDate), "yyyy-MM-dd");

    // Motorista (PIX + remuneração)
    const { data: mot } = await supabase
      .from("motoristas")
      .select("chave_pix, tipo_chave_pix, nome, salario_fixo, valor_diaria_por_pedido")
      .eq("id", motoristaId)
      .single();
    setMotorista(mot as Motorista | null);

    // Acerto do mês
    const { data: acData } = await supabase
      .from("acertos_motorista")
      .select("*")
      .eq("motorista_id", motoristaId)
      .eq("mes_referencia", dateStr)
      .maybeSingle();

    let ac: Acerto;
    if (acData) {
      ac = {
        id: acData.id,
        status: acData.status,
        saldo_anterior: Number(acData.saldo_anterior ?? 0),
        observacoes: acData.observacoes ?? "",
      };
    } else {
      ac = { id: null, status: "aberto", saldo_anterior: 0, observacoes: "" };
      const { data: prevAc } = await supabase
        .from("acertos_motorista")
        .select("valor_final")
        .eq("motorista_id", motoristaId)
        .eq("mes_referencia", format(subMonths(refDate, 1), "yyyy-MM-dd"))
        .maybeSingle();
      if (prevAc && prevAc.valor_final != null && prevAc.valor_final < 0) {
        ac.saldo_anterior = Number(prevAc.valor_final);
      }
    }
    setAcerto(ac);

    // Ajustes
    if (ac.id) {
      const { data: aj } = await supabase
        .from("acerto_ajustes")
        .select("*")
        .eq("acerto_id", ac.id);
      setAjustes(
        (aj ?? []).map(a => ({
          id: a.id,
          tipo: a.tipo,
          descricao: a.descricao,
          valor: Number(a.valor),
          parcela_atual: Number(a.parcela_atual ?? 1),
          total_parcelas: Number(a.total_parcelas ?? 1),
        }))
      );
    } else {
      setAjustes([]);
    }

    // Pedidos concluídos no mês (para diárias)
    const { data: pedidos } = await supabase
      .from("pedidos")
      .select("id, data_fim_real, data_inicio_real")
      .eq("motorista_id", motoristaId)
      .eq("status", "concluido")
      .gte("data_fim_real", startStr + "T00:00:00")
      .lte("data_fim_real", endStr + "T23:59:59");
    setPedidosMes((pedidos ?? []) as PedidoConcluido[]);

    // Adiantamentos pagos no mês
    const { data: adts } = await supabase
      .from("adiantamentos")
      .select("id, valor, data_pagamento, justificativa")
      .eq("motorista_id", motoristaId)
      .gte("data_pagamento", startStr)
      .lte("data_pagamento", endStr);
    setAdiantamentosMes((adts ?? []).map(a => ({
      id: a.id,
      valor: Number(a.valor),
      data_pagamento: a.data_pagamento,
      justificativa: a.justificativa,
    })));

    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate, motoristaId]);

  const totais = useMemo(() => {
    const salarioFixo = Number(motorista?.salario_fixo ?? 0);
    const valorDiaria = Number(motorista?.valor_diaria_por_pedido ?? 0);
    const qtdPedidos = pedidosMes.length;
    const totalDiarias = valorDiaria * qtdPedidos;

    let ajustesVal = 0;
    ajustes.forEach(a => {
      const v = Number(a.valor);
      if (a.tipo === "bonus" || a.tipo === "reembolso") ajustesVal += v;
      else ajustesVal -= v;
    });

    const totalAdiantamentos = adiantamentosMes.reduce((s, a) => s + Number(a.valor || 0), 0);

    const final =
      Number(acerto?.saldo_anterior ?? 0) +
      salarioFixo +
      totalDiarias +
      ajustesVal -
      totalAdiantamentos;

    return {
      salarioFixo,
      valorDiaria,
      qtdPedidos,
      totalDiarias,
      ajustes: ajustesVal,
      adiantamentos: totalAdiantamentos,
      final,
    };
  }, [acerto, ajustes, motorista, pedidosMes, adiantamentosMes]);

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

  const fecharAcerto = async (pagarAgora: boolean) => {
    setSaving(true);
    let acId = acerto?.id ?? null;

    if (!acId) {
      const { data, error } = await supabase
        .from("acertos_motorista")
        .insert({
          motorista_id: motoristaId,
          mes_referencia: format(refDate, "yyyy-MM-dd"),
          status: pagarAgora ? "fechado" : "agendado",
          data_pagamento: pagarAgora ? format(new Date(), "yyyy-MM-dd") : null,
          saldo_anterior: acerto?.saldo_anterior ?? 0,
          total_fretes: totais.totalDiarias,
          total_ajustes: totais.ajustes,
          valor_final: totais.final,
          observacoes: acerto?.observacoes ?? "",
        })
        .select("id")
        .single();
      if (error || !data) {
        alert("Erro ao criar acerto: " + (error?.message ?? "desconhecido"));
        setSaving(false);
        return;
      }
      acId = data.id;
    } else {
      await supabase
        .from("acertos_motorista")
        .update({
          status: pagarAgora ? "fechado" : "agendado",
          data_pagamento: pagarAgora ? format(new Date(), "yyyy-MM-dd") : null,
          total_fretes: totais.totalDiarias,
          total_ajustes: totais.ajustes,
          valor_final: totais.final,
          observacoes: acerto?.observacoes ?? "",
        })
        .eq("id", acId);
      await supabase.from("acerto_ajustes").delete().eq("acerto_id", acId);
    }

    if (ajustes.length > 0 && acId) {
      const ajToIns = ajustes.map(a => ({
        acerto_id: acId,
        tipo: a.tipo,
        descricao: a.descricao,
        valor: a.valor,
        parcela_atual: a.parcela_atual,
        total_parcelas: a.total_parcelas,
      }));
      await supabase.from("acerto_ajustes").insert(ajToIns);
    }

    setSaving(false);
    setModalStep(3);
    loadData();
  };

  const monthLabel = format(refDate, "MMMM yyyy", { locale: ptBR }).toUpperCase();
  const isFechado = acerto?.status === "fechado";

  if (loading) {
    return <p style={{ color: "#94a3b8" }}>Carregando acerto...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* DATE PICKER */}
      {(() => {
        const currentYear = new Date().getFullYear();
        const allYears = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
        const yearsFirst = allYears.slice(0, 3);
        const yearsSecond = allYears.slice(3);
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
        const chipInactive: React.CSSProperties = { ...chipBase, background: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0" };
        const chipActive: React.CSSProperties = { ...chipBase, background: "#1e40af", color: "#fff", borderColor: "#1e40af" };

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
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Ano</div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                {yearsFirst.map(y => (
                  <span key={y} style={y === selectedYear ? chipActive : chipInactive} onClick={() => selectDate(y, selectedMonth)}>{y}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {yearsSecond.map(y => (
                  <span key={y} style={y === selectedYear ? chipActive : chipInactive} onClick={() => selectDate(y, selectedMonth)}>{y}</span>
                ))}
              </div>
            </div>

            <div style={{ width: "1px", height: "44px", background: "#e2e8f0" }} />

            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Mês</div>
              <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                {monthsFirst.map(m => (
                  <span key={m} style={m === selectedMonth ? chipActive : chipInactive} onClick={() => selectDate(selectedYear, m)}>{String(m).padStart(2, "0")}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                {monthsSecond.map(m => (
                  <span key={m} style={m === selectedMonth ? chipActive : chipInactive} onClick={() => selectDate(selectedYear, m)}>{String(m).padStart(2, "0")}</span>
                ))}
              </div>
            </div>

            <div style={{ width: "1px", height: "44px", background: "#e2e8f0" }} />

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

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          <FormSection title="Pedidos Concluídos no Mês">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Quantidade de pedidos concluídos</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{totais.qtdPedidos}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                  Diária: {fmtMoeda(totais.valorDiaria)} × {totais.qtdPedidos}
                </div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#16a34a" }}>{fmtMoeda(totais.totalDiarias)}</div>
              </div>
            </div>
            {totais.valorDiaria === 0 && (
              <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>
                Valor da diária não cadastrado. Defina em &quot;Remuneração&quot; para calcular automaticamente.
              </p>
            )}
          </FormSection>

          {adiantamentosMes.length > 0 && (
            <FormSection title="Adiantamentos do Mês (deduzidos)">
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "8px" }}>Data</th>
                    <th style={{ padding: "8px" }}>Descrição</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {adiantamentosMes.map(a => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px" }}>{a.data_pagamento ? format(new Date(a.data_pagamento + "T00:00:00"), "dd/MM") : "—"}</td>
                      <td style={{ padding: "8px" }}>{a.justificativa ?? "Adiantamento"}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#dc2626", fontWeight: 600 }}>-{fmtMoeda(a.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FormSection>
          )}

          <FormSection title="Ajustes (Bônus, Descontos, Reembolsos)">
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
                  {ajustes.map(a => {
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
                  <select value={novoAjuste.tipo} onChange={e => setNovoAjuste({ ...novoAjuste, tipo: e.target.value })} style={selectStyle}>
                    <option value="desconto">Desconto</option>
                    <option value="bonus">Bônus</option>
                    <option value="reembolso">Reembolso</option>
                    <option value="emprestimo">Empréstimo (Retenção)</option>
                    <option value="multa">Multa</option>
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Descrição</label>
                  <input value={novoAjuste.descricao} onChange={e => setNovoAjuste({ ...novoAjuste, descricao: e.target.value })} style={inputStyle} placeholder="Ex: Bônus por pontualidade" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Valor (R$)</label>
                  <input type="number" step="0.01" value={novoAjuste.valor} onChange={e => setNovoAjuste({ ...novoAjuste, valor: e.target.value })} style={inputStyle} placeholder="0.00" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Parcelas</label>
                  <input type="number" min="1" value={novoAjuste.parcelas} onChange={e => setNovoAjuste({ ...novoAjuste, parcelas: e.target.value })} style={inputStyle} />
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
              <span style={{ color: (acerto?.saldo_anterior ?? 0) < 0 ? "#ef4444" : "#fff" }}>{fmtMoeda(acerto?.saldo_anterior ?? 0)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
              <span style={{ color: "#cbd5e1" }}>Salário Fixo:</span>
              <span style={{ color: "#4ade80" }}>+{fmtMoeda(totais.salarioFixo)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
              <span style={{ color: "#cbd5e1" }}>Diárias ({totais.qtdPedidos} pedidos):</span>
              <span style={{ color: "#4ade80" }}>+{fmtMoeda(totais.totalDiarias)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
              <span style={{ color: "#cbd5e1" }}>Ajustes:</span>
              <span style={{ color: totais.ajustes < 0 ? "#ef4444" : "#4ade80" }}>
                {totais.ajustes > 0 ? "+" : ""}{fmtMoeda(totais.ajustes)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px", borderBottom: "1px solid #334155", paddingBottom: "12px" }}>
              <span style={{ color: "#cbd5e1" }}>Adiantamentos:</span>
              <span style={{ color: "#ef4444" }}>-{fmtMoeda(totais.adiantamentos)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px", fontSize: "18px", fontWeight: 700 }}>
              <span>Total a Pagar:</span>
              <span style={{ color: totais.final < 0 ? "#ef4444" : "#fff" }}>{fmtMoeda(totais.final)}</span>
            </div>

            {!isFechado && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <textarea
                  value={acerto?.observacoes ?? ""}
                  onChange={e => setAcerto(acerto ? { ...acerto, observacoes: e.target.value } : null)}
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
                Ver Recibo
              </Btn>
            )}
          </div>
        </div>

      </div>

      {/* MODAL FECHAMENTO (3 STEPS) */}
      {modalStep > 0 && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "500px", maxWidth: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", overflow: "hidden" }}>

            {/* Step 1: Resumo */}
            {modalStep === 1 && (
              <div style={{ padding: "24px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Revisão do Acerto</h3>
                <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>
                  Verifique os valores antes de prosseguir.
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

            {/* Step 3: Concluído */}
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
                  <Btn type="button" variant="ghost" onClick={() => setModalStep(0)} style={{ justifyContent: "center" }}>
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

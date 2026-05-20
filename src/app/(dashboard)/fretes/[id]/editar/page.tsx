"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";

type Veiculo   = { id: string; placa: string; modelo: string; marca: string; km_atual: number | null };
type Motorista = {
  id: string; nome: string; tipo_comissao: string;
  percentual_frete: number | null; valor_fixo_por_viagem: number | null;
  valor_por_km: number | null; salario_fixo: number | null;
};
type Cliente   = { id: string; nome_fantasia: string };

type TabId = "operacional" | "cronograma" | "financeiro";

export default function EditarFretePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [tab, setTab]         = useState<TabId>("operacional");

  const [veiculos,   setVeiculos]   = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [clientes,   setClientes]   = useState<Cliente[]>([]);
  const [motoristaSel, setMotoristaSel] = useState<Motorista | null>(null);

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "", cliente_id: "",
    origem: "", destino: "",
    valor_frete: "", km_inicial: "", km_final: "",
    tipo_carga: "", peso_carga_kg: "",
    data_coleta_prevista: "", data_entrega_prevista: "",
    forma_pagamento: "a_vista",
    observacoes: "", status: "agendado",
    pago: "false", data_pagamento: "",
    comissao_motorista_valor: "", observacoes_financeiras: "",
  });

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id").eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const [freteRes, v, m, c] = await Promise.all([
        supabase.from("fretes").select("*").eq("id", id).single(),
        supabase.from("veiculos").select("id,placa,modelo,marca,km_atual").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome,tipo_comissao,percentual_frete,valor_fixo_por_viagem,valor_por_km,salario_fixo").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("clientes").select("id,nome_fantasia").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome_fantasia"),
      ]);

      setVeiculos(v.data ?? []);
      setMotoristas(m.data ?? []);
      setClientes(c.data ?? []);

      const frete = freteRes.data;
      if (frete) {
        setF({
          veiculo_id: frete.veiculo_id ?? "",
          motorista_id: frete.motorista_id ?? "",
          cliente_id: frete.cliente_id ?? "",
          origem: frete.origem ?? "",
          destino: frete.destino ?? "",
          valor_frete: frete.valor_frete != null ? String(frete.valor_frete) : "",
          km_inicial: frete.km_inicial != null ? String(frete.km_inicial) : "",
          km_final: frete.km_final != null ? String(frete.km_final) : "",
          tipo_carga: frete.tipo_carga ?? "",
          peso_carga_kg: frete.peso_carga_kg != null ? String(frete.peso_carga_kg) : "",
          data_coleta_prevista: frete.data_coleta_prevista ?? "",
          data_entrega_prevista: frete.data_entrega_prevista ?? "",
          forma_pagamento: frete.forma_pagamento ?? "a_vista",
          observacoes: frete.observacoes ?? "",
          status: frete.status ?? "agendado",
          pago: frete.pago ? "true" : "false",
          data_pagamento: frete.data_pagamento ?? "",
          comissao_motorista_valor: frete.comissao_motorista_valor != null ? String(frete.comissao_motorista_valor) : "",
          observacoes_financeiras: frete.observacoes_financeiras ?? "",
        });
        setMotoristaSel((m.data ?? []).find(mt => mt.id === frete.motorista_id) ?? null);
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-calculate commission when status = concluido
  useEffect(() => {
    if (f.status !== "concluido" || !motoristaSel) return;
    let v: number | null = null;
    const valorFrete = parseFloat(f.valor_frete || "0");
    const kmI = parseFloat(f.km_inicial || "0");
    const kmF = parseFloat(f.km_final || "0");
    const kmRodado = kmF > kmI ? kmF - kmI : 0;
    switch (motoristaSel.tipo_comissao) {
      case "percentual_frete":
      case "salario_mais_percentual":
        if (valorFrete > 0 && motoristaSel.percentual_frete)
          v = (valorFrete * motoristaSel.percentual_frete) / 100;
        break;
      case "valor_fixo_viagem":
        v = motoristaSel.valor_fixo_por_viagem ?? null;
        break;
      case "valor_por_km":
      case "salario_mais_km":
        if (kmRodado > 0 && motoristaSel.valor_por_km)
          v = kmRodado * motoristaSel.valor_por_km;
        break;
    }
    if (v !== null) {
      const newVal = v.toFixed(2);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setF(p => p.comissao_motorista_valor === newVal ? p : { ...p, comissao_motorista_valor: newVal });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.status, f.valor_frete, f.km_inicial, f.km_final, motoristaSel]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.veiculo_id || !f.motorista_id || !f.origem || !f.destino || !f.km_inicial) {
      setErr("Preencha: Veículo, Motorista, Origem, Destino e KM Inicial"); return;
    }
    setSaving(true);
    const { error: dbErr } = await supabase.from("fretes").update({
      veiculo_id: f.veiculo_id,
      motorista_id: f.motorista_id,
      cliente_id: f.cliente_id || null,
      origem: f.origem.toUpperCase(),
      destino: f.destino.toUpperCase(),
      valor_frete: f.valor_frete ? parseFloat(f.valor_frete) : null,
      km_inicial: parseFloat(f.km_inicial),
      km_final: f.km_final ? parseFloat(f.km_final) : null,
      tipo_carga: f.tipo_carga || null,
      peso_carga_kg: f.peso_carga_kg ? parseFloat(f.peso_carga_kg) : null,
      data_coleta_prevista: f.data_coleta_prevista || null,
      data_entrega_prevista: f.data_entrega_prevista || null,
      forma_pagamento: f.forma_pagamento || null,
      observacoes: f.observacoes || null,
      status: f.status,
      pago: f.pago === "true",
      data_pagamento: f.data_pagamento || null,
      comissao_motorista_valor: f.comissao_motorista_valor ? parseFloat(f.comissao_motorista_valor) : null,
      observacoes_financeiras: f.observacoes_financeiras || null,
    }).eq("id", id);
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/fretes"); router.refresh();
  };

  const veiculoSel = veiculos.find(v => v.id === f.veiculo_id);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Frete / Viagem"
        actions={
          <>
            <Btn href="/fretes" variant="ghost">← Voltar</Btn>
            <Btn href="/fretes" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "operacional", label: "Operacional" },
            { id: "cronograma", label: "Cronograma & Carga" },
            { id: "financeiro", label: "Financeiro" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {tab === "operacional" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Status do Frete">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="Status">
                  <select value={f.status} onChange={set("status")} style={selectStyle}>
                    <option value="agendado">Agendado</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Veículo, Motorista e Cliente">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                <FormField label="Veículo *">
                  <select value={f.veiculo_id} onChange={set("veiculo_id")} style={selectStyle}>
                    <option value="">— Selecione —</option>
                    {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
                  </select>
                  {veiculoSel && <p style={{ fontSize: "11px", color: "#2563eb", marginTop: "4px" }}>KM atual: {veiculoSel.km_atual?.toLocaleString("pt-BR") ?? "—"}</p>}
                </FormField>
                <FormField label="Motorista *">
                  <select value={f.motorista_id} onChange={(e) => {
                    set("motorista_id")(e);
                    setMotoristaSel(motoristas.find(m => m.id === e.target.value) ?? null);
                  }} style={selectStyle}>
                    <option value="">— Selecione —</option>
                    {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {motoristaSel && (
                    <p style={{ fontSize: "11px", color: "#7c3aed", marginTop: "4px" }}>
                      Comissão: {motoristaSel.tipo_comissao?.replace(/_/g, " ")}
                      {motoristaSel.percentual_frete ? ` (${motoristaSel.percentual_frete}%)` : ""}
                      {motoristaSel.valor_por_km ? ` (R$${motoristaSel.valor_por_km}/km)` : ""}
                    </p>
                  )}
                </FormField>
                <FormField label="Cliente (opcional)">
                  <select value={f.cliente_id} onChange={set("cliente_id")} style={selectStyle}>
                    <option value="">— Sem cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia}</option>)}
                  </select>
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Rota">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <FormField label="Origem *">
                  <input value={f.origem} onChange={(e) => setF(p => ({ ...p, origem: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} />
                </FormField>
                <FormField label="Destino *">
                  <input value={f.destino} onChange={(e) => setF(p => ({ ...p, destino: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Observações Gerais">
              <textarea value={f.observacoes} onChange={set("observacoes")} rows={3}
                style={{ ...inputStyle, resize: "vertical", height: "auto" }} />
            </FormSection>
          </div>
        )}

        {tab === "cronograma" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Quilometragem">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="KM Inicial *">
                  <input value={f.km_inicial} onChange={set("km_inicial")} type="number" step="0.1" style={inputStyle} />
                </FormField>
                <FormField label="KM Final" hint="Preencher ao concluir o frete">
                  <input value={f.km_final} onChange={set("km_final")} type="number" step="0.1" style={inputStyle} placeholder="Preencher ao concluir" />
                  {f.km_final && f.km_inicial && parseFloat(f.km_final) > parseFloat(f.km_inicial) && (
                    <p style={{ fontSize: "11px", color: "#2563eb", marginTop: "4px" }}>
                      {(parseFloat(f.km_final) - parseFloat(f.km_inicial)).toLocaleString("pt-BR")} km rodados
                    </p>
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas previstas">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Data Coleta Prevista">
                  <input value={f.data_coleta_prevista} onChange={set("data_coleta_prevista")} type="date" style={inputStyle} />
                </FormField>
                <FormField label="Data Entrega Prevista">
                  <input value={f.data_entrega_prevista} onChange={set("data_entrega_prevista")} type="date" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Carga">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Tipo de Carga">
                  <input value={f.tipo_carga} onChange={set("tipo_carga")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                </FormField>
                <FormField label="Peso (kg)">
                  <input value={f.peso_carga_kg} onChange={set("peso_carga_kg")} type="number" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>
          </div>
        )}

        {tab === "financeiro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Valor e Pagamento">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="Valor do Frete (R$)">
                  <IMaskInput mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true } }}
                    value={f.valor_frete}
                    onAccept={(_, m) => setF(p => ({ ...p, valor_frete: String(m.unmaskedValue) }))}
                    style={inputStyle} />
                </FormField>
                <FormField label="Forma de Pagamento">
                  <select value={f.forma_pagamento} onChange={set("forma_pagamento")} style={selectStyle}>
                    <option value="a_vista">À vista</option>
                    <option value="7d">7 dias</option>
                    <option value="14d">14 dias</option>
                    <option value="21d">21 dias</option>
                    <option value="30d">30 dias</option>
                    <option value="45d">45 dias</option>
                    <option value="60d">60 dias</option>
                    <option value="outros">Outros</option>
                  </select>
                </FormField>
                <FormField label="Pagamento Recebido">
                  <select value={f.pago} onChange={set("pago")} style={selectStyle}>
                    <option value="false">Pendente</option>
                    <option value="true">Pago</option>
                  </select>
                </FormField>
                {f.pago === "true" && (
                  <FormField label="Data do Pagamento">
                    <input value={f.data_pagamento} onChange={set("data_pagamento")} type="date" style={inputStyle} />
                  </FormField>
                )}
              </div>
            </FormSection>

            <FormSection title="Comissão do Motorista">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Comissão Motorista (R$)" hint={f.status === "concluido" ? "Auto-calculado pelo tipo de comissão do motorista" : "Disponível após concluir o frete"}>
                  <input
                    value={f.comissao_motorista_valor}
                    onChange={set("comissao_motorista_valor")}
                    type="number" step="0.01" style={{
                      ...inputStyle,
                      background: f.status === "concluido" && f.comissao_motorista_valor ? "#f0fdf4" : undefined,
                      borderColor: f.status === "concluido" && f.comissao_motorista_valor ? "#bbf7d0" : undefined,
                      color: f.status === "concluido" && f.comissao_motorista_valor ? "#166534" : undefined,
                      fontWeight: f.status === "concluido" && f.comissao_motorista_valor ? 700 : undefined,
                    }}
                    placeholder={f.status === "concluido" ? "Auto-calculado" : "Disponível ao concluir"}
                  />
                  {f.status === "concluido" && motoristaSel && (
                    <p style={{ fontSize: "11px", color: "#7c3aed", marginTop: "4px" }}>
                      Tipo: {motoristaSel.tipo_comissao?.replace(/_/g, " ")}
                    </p>
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Observações Financeiras">
              <textarea value={f.observacoes_financeiras} onChange={set("observacoes_financeiras")} rows={3}
                style={{ ...inputStyle, resize: "vertical", height: "auto" }} />
            </FormSection>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
          <Btn href="/fretes" variant="outline">Cancelar</Btn>
          <Btn type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Atualizar Frete"}
          </Btn>
        </div>
      </div>
    </form>
  );
}

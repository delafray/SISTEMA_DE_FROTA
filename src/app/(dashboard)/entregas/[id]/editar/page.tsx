"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";

type Veiculo   = { id: string; placa: string; modelo: string; marca: string; km_atual: number | null };
type Motorista = {
  id: string; nome: string;
  salario_fixo: number | null; valor_diaria_por_pedido: number | null;
};

type TabId = "operacional" | "cronograma" | "financeiro";

export default function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [tab, setTab]         = useState<TabId>("operacional");
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [statusOriginal, setStatusOriginal] = useState("");

  const [veiculos,   setVeiculos]   = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [motoristaSel, setMotoristaSel] = useState<Motorista | null>(null);
  const [valorPedidoInicial, setValorPedidoInicial] = useState("");

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "",
    valor_pedido: "", km_inicial: "", km_final: "",
    data_inicio_prevista: "", data_fim_prevista: "",
    data_inicio_real: "", data_fim_real: "",
    forma_pagamento: "a_vista",
    observacoes: "", status: "agendado",
    pago: "false", data_pagamento: "",
    observacoes_financeiras: "",
  });

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id").eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const [pedidoRes, v, m] = await Promise.all([
        supabase.from("pedidos").select("*").eq("id", id).single(),
        supabase.from("veiculos").select("id,placa,modelo,marca,km_atual").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome,salario_fixo,valor_diaria_por_pedido").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
      ]);

      setVeiculos(v.data ?? []);
      setMotoristas(m.data ?? []);

      const pedido = pedidoRes.data;
      if (pedido) {
        setF({
          veiculo_id: pedido.veiculo_id ?? "",
          motorista_id: pedido.motorista_id ?? "",
          valor_pedido: pedido.valor_pedido != null ? String(pedido.valor_pedido) : "",
          km_inicial: pedido.km_inicial != null ? String(pedido.km_inicial) : "",
          km_final: pedido.km_final != null ? String(pedido.km_final) : "",
          data_inicio_prevista: pedido.data_inicio_prevista ?? "",
          data_fim_prevista: pedido.data_fim_prevista ?? "",
          data_inicio_real: pedido.data_inicio_real ?? "",
          data_fim_real: pedido.data_fim_real ?? "",
          forma_pagamento: pedido.forma_pagamento ?? "a_vista",
          observacoes: pedido.observacoes ?? "",
          status: pedido.status ?? "agendado",
          pago: pedido.pago ? "true" : "false",
          data_pagamento: pedido.data_pagamento ?? "",
          observacoes_financeiras: pedido.observacoes_financeiras ?? "",
        });
        setMotoristaSel((m.data ?? []).find(mt => mt.id === pedido.motorista_id) ?? null);
        setValorPedidoInicial(pedido.valor_pedido != null ? String(pedido.valor_pedido) : "");
        setStatusOriginal(pedido.status ?? "agendado");
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const executarSalvar = async () => {
    setErr("");
    setSaving(true);
    const { error: dbErr } = await supabase.from("pedidos").update({
      veiculo_id: f.veiculo_id,
      motorista_id: f.motorista_id,
      valor_pedido: f.valor_pedido ? parseFloat(f.valor_pedido) : null,
      km_inicial: parseFloat(f.km_inicial),
      km_final: f.km_final ? parseFloat(f.km_final) : null,
      data_inicio_prevista: f.data_inicio_prevista || null,
      data_fim_prevista: f.data_fim_prevista || null,
      data_inicio_real: f.data_inicio_real || null,
      data_fim_real: f.data_fim_real || null,
      forma_pagamento: f.forma_pagamento || null,
      observacoes: f.observacoes || null,
      status: f.status,
      pago: f.pago === "true",
      data_pagamento: f.data_pagamento || null,
      observacoes_financeiras: f.observacoes_financeiras || null,
    }).eq("id", id);
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/entregas"); router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.veiculo_id || !f.motorista_id) {
      setTab("operacional");
      setErr("Preencha: Veículo e Motorista"); return;
    }
    if (!f.km_inicial) {
      setTab("cronograma");
      setErr("Preencha: KM Inicial"); return;
    }
    if (f.km_final && f.km_inicial && parseFloat(f.km_final) < parseFloat(f.km_inicial)) {
      setTab("cronograma");
      setErr("KM Final não pode ser menor que KM Inicial"); return;
    }
    if (f.pago === "true" && !f.data_pagamento) {
      setTab("financeiro");
      setErr("Preencha a data do pagamento quando o pedido está marcado como Pago"); return;
    }
    if (f.status === "cancelado" && statusOriginal !== "cancelado") {
      setPendingSubmit(true);
      setConfirmStatus(true);
      return;
    }
    await executarSalvar();
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
        title="Editar Pedido"
        actions={
          <>
            <Btn variant="ghost" className="m-hide" onClick={() => setConfirmCancelar(true)}>← Voltar</Btn>
            <Btn variant="outline" onClick={() => setConfirmCancelar(true)}>Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving} loading={saving}>
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
            { id: "cronograma", label: "Cronograma" },
            { id: "financeiro", label: "Financeiro" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {tab === "operacional" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Status do Pedido">
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

            <FormSection title="Veículo e Motorista">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
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
                      {motoristaSel.salario_fixo != null ? `Salário R$${motoristaSel.salario_fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                      {motoristaSel.valor_diaria_por_pedido != null ? ` · Diária R$${motoristaSel.valor_diaria_por_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                    </p>
                  )}
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
                <FormField label="KM Final" hint="Preencher ao concluir o pedido">
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
                <FormField label="Início Previsto">
                  <input value={f.data_inicio_prevista} onChange={set("data_inicio_prevista")} type="date" style={inputStyle} />
                </FormField>
                <FormField label="Fim Previsto">
                  <input value={f.data_fim_prevista} onChange={set("data_fim_prevista")} type="date" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas reais">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Início Real">
                  <input value={f.data_inicio_real} onChange={set("data_inicio_real")} type="date" style={inputStyle} />
                </FormField>
                <FormField label="Fim Real">
                  <input value={f.data_fim_real} onChange={set("data_fim_real")} type="date" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>
          </div>
        )}

        {tab === "financeiro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Valor e Pagamento">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="Valor do Pedido (R$)">
                  {/* defaultValue (não-controlado): com `value` a máscara briga com o
                      estado a cada tecla e trava. O form só monta depois do load. */}
                  <IMaskInput key={valorPedidoInicial} mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true, padFractionalZeros: true } }}
                    defaultValue={valorPedidoInicial}
                    onAccept={(_, m) => setF(p => ({ ...p, valor_pedido: String(m.unmaskedValue) }))}
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

            <FormSection title="Observações Financeiras">
              <textarea value={f.observacoes_financeiras} onChange={set("observacoes_financeiras")} rows={3}
                style={{ ...inputStyle, resize: "vertical", height: "auto" }} />
            </FormSection>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
          <Btn variant="outline" onClick={() => setConfirmCancelar(true)}>Cancelar</Btn>
          <Btn type="submit" disabled={saving} loading={saving}>
            {saving ? "Salvando..." : "Atualizar Pedido"}
          </Btn>
        </div>
      </div>

      {/* Modal: descartar alterações */}
      {confirmCancelar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px", color: "#1e293b" }}>Descartar alterações?</h3>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#475569" }}>As alterações não salvas serão perdidas.</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => setConfirmCancelar(false)}>Voltar</Btn>
              <Btn variant="danger" onClick={() => router.push("/entregas")}>Descartar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar cancelamento do pedido */}
      {confirmStatus && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "16px", color: "#1e293b" }}>Cancelar este pedido?</h3>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#475569" }}>O status será alterado para <strong>Cancelado</strong>. Essa ação é difícil de reverter.</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => { setConfirmStatus(false); setPendingSubmit(false); }}>Voltar</Btn>
              <Btn variant="danger" loading={saving} onClick={async () => { setConfirmStatus(false); if (pendingSubmit) { setPendingSubmit(false); await executarSalvar(); } }}>Confirmar Cancelamento</Btn>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

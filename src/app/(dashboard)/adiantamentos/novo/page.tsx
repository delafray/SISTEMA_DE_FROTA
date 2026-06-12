"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { empresaDoMotorista } from "@/lib/utils/empresaDe";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

type Motorista = { id: string; nome: string };

export default function NovoAdiantamentoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [confirmModal, setConfirmModal] = useState(false);

  const [f, setF] = useState({
    motorista_id: "",
    tipo: "adiantamento",
    valor: "",
    justificativa: "",
    data_pagamento: "",
    status: "pendente",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    const loadMotoristas = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      // Motoristas COMPARTILHADOS na seleção → todos os ativos.
      const { data } = await supabase.from("motoristas")
        .select("id,nome")
        .eq("ativo", true)
        .order("nome");
      if (data) setMotoristas(data);
    };
    loadMotoristas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normNum = (s: string) => parseFloat(s.replace(",", "."));

  const doInsert = async () => {
    setSaving(true);
    const valorNum = normNum(f.valor);
    const empresa_id = await empresaDoMotorista(supabase, f.motorista_id);
    if (!empresa_id) { setSaving(false); setErr("Motorista sem empresa definida"); return; }
    const { error: dbErr } = await supabase.from("adiantamentos").insert({
      empresa_id,
      motorista_id: f.motorista_id,
      tipo: f.tipo,
      valor: valorNum,
      justificativa: f.justificativa || null,
      data_pagamento: f.data_pagamento || null,
      status: f.status,
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/adiantamentos");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    const valorNum = normNum(f.valor);
    if (!f.valor || isNaN(valorNum) || valorNum <= 0) { setErr("Informe um valor válido (use vírgula ou ponto como separador decimal)"); return; }
    if (f.status !== "pendente") {
      setConfirmModal(true);
      return;
    }
    await doInsert();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Novo Adiantamento"
        actions={
          <span className="m-hide">
            <Btn href="/adiantamentos" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/adiantamentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" loading={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </span>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ maxWidth: "720px" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <FormSection title="Dados do Adiantamento">
            <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <FormField label="Motorista *">
                  <select value={f.motorista_id} onChange={set("motorista_id")} style={selectStyle}>
                    <option value="">Selecione um motorista</option>
                    {motoristas.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Tipo *">
                <select value={f.tipo} onChange={set("tipo")} style={selectStyle}>
                  <option value="adiantamento">Adiantamento</option>
                  <option value="vale">Vale</option>
                  <option value="despesa_viagem">Despesa de Viagem</option>
                  <option value="outros">Outros</option>
                </select>
              </FormField>

              <FormField label="Valor (R$) *">
                <input
                  value={f.valor}
                  onChange={set("valor")}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="0,00"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Status">
                <select value={f.status} onChange={set("status")} style={selectStyle}>
                  <option value="pendente">Pendente</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="recusado">Recusado</option>
                  <option value="prestado">Prestado</option>
                </select>
              </FormField>

              <FormField label="Data de Pagamento">
                <input
                  value={f.data_pagamento}
                  onChange={set("data_pagamento")}
                  type="date"
                  style={inputStyle}
                />
              </FormField>

              <div style={{ gridColumn: "span 2" }}>
                <FormField label="Justificativa">
                  <textarea
                    value={f.justificativa}
                    onChange={set("justificativa")}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Descreva o motivo do adiantamento..."
                  />
                </FormField>
              </div>
            </div>
          </FormSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", position: "sticky", bottom: 0, background: "#fff", zIndex: 10, paddingBottom: "16px" }}>
            <Btn href="/adiantamentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" loading={saving}>
              {saving ? "Salvando..." : "Salvar Adiantamento"}
            </Btn>
          </div>
        </div>
      </div>
      {confirmModal && (
        <div className="m-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="m-modal-body">
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e293b", marginBottom: "8px" }}>Confirmar status</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "20px" }}>
                Você está criando este adiantamento já como <strong>&quot;{f.status}&quot;</strong>. Esta ação afeta o acerto do motorista. Confirmar?
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <Btn variant="outline" onClick={() => setConfirmModal(false)}>Voltar</Btn>
                <Btn variant="danger" loading={saving} onClick={async () => { setConfirmModal(false); await doInsert(); }}>Confirmar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

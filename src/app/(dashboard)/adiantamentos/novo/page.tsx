"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

type Motorista = { id: string; nome: string };

export default function NovoAdiantamentoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

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
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      const { data } = await supabase.from("motoristas")
        .select("id,nome")
        .eq("empresa_id", ue.empresa_id)
        .eq("ativo", true)
        .order("nome");
      if (data) setMotoristas(data);
    };
    loadMotoristas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    if (!f.valor || parseFloat(f.valor) <= 0) { setErr("Informe um valor válido"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); setErr("Não autenticado"); return; }
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
      .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setSaving(false); setErr("Empresa não encontrada"); return; }

    const { error: dbErr } = await supabase.from("adiantamentos").insert({
      empresa_id: ue.empresa_id,
      motorista_id: f.motorista_id,
      tipo: f.tipo,
      valor: parseFloat(f.valor),
      justificativa: f.justificativa || null,
      data_pagamento: f.data_pagamento || null,
      status: f.status,
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/adiantamentos");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Novo Adiantamento"
        actions={
          <>
            <Btn href="/adiantamentos" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/adiantamentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </>
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
                  type="number"
                  step="0.01"
                  min="0.01"
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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
            <Btn href="/adiantamentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar Adiantamento"}
            </Btn>
          </div>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

type Motorista = { id: string; nome: string };

export default function EditarAdiantamentoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  const [f, setF] = useState({
    motorista_id: "",
    tipo: "adiantamento",
    valor: "",
    justificativa: "",
    data_pagamento: "",
    status: "pendente",
    recusa_motivo: "",
    valor_prestado_contas: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const [{ data: mots }, { data: adiant }] = await Promise.all([
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("adiantamentos").select("*").eq("id", id).single(),
      ]);

      if (mots) setMotoristas(mots);
      if (adiant) {
        setF({
          motorista_id: adiant.motorista_id ?? "",
          tipo: adiant.tipo ?? "adiantamento",
          valor: adiant.valor != null ? String(adiant.valor) : "",
          justificativa: adiant.justificativa ?? "",
          data_pagamento: adiant.data_pagamento ?? "",
          status: adiant.status ?? "pendente",
          recusa_motivo: adiant.recusa_motivo ?? "",
          valor_prestado_contas: adiant.valor_prestado_contas != null ? String(adiant.valor_prestado_contas) : "",
        });
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    if (!f.valor || parseFloat(f.valor) <= 0) { setErr("Informe um valor válido"); return; }
    setSaving(true);

    const { error: dbErr } = await supabase.from("adiantamentos").update({
      motorista_id: f.motorista_id,
      tipo: f.tipo,
      valor: parseFloat(f.valor),
      justificativa: f.justificativa || null,
      data_pagamento: f.data_pagamento || null,
      status: f.status,
      recusa_motivo: f.status === "recusado" ? (f.recusa_motivo || null) : null,
      valor_prestado_contas: f.status === "prestado" && f.valor_prestado_contas
        ? parseFloat(f.valor_prestado_contas)
        : null,
    }).eq("id", id);
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/adiantamentos");
    router.refresh();
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <PageHeader title="Editar Adiantamento" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "13px" }}>
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Adiantamento"
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
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

              {f.status === "recusado" && (
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Motivo da Recusa">
                    <textarea
                      value={f.recusa_motivo}
                      onChange={set("recusa_motivo")}
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                      placeholder="Informe o motivo da recusa..."
                    />
                  </FormField>
                </div>
              )}

              {f.status === "prestado" && (
                <FormField label="Valor Prestado em Contas (R$)">
                  <input
                    value={f.valor_prestado_contas}
                    onChange={set("valor_prestado_contas")}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    style={inputStyle}
                  />
                </FormField>
              )}
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

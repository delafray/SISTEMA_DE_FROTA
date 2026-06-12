"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
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
  const [confirmModal, setConfirmModal] = useState<{ status: string } | null>(null);
  // status carregado do banco — confirmação só quando o status MUDA pra um
  // estado que libera dinheiro/fecha o ciclo (aprovado/recusado/prestado)
  const [statusOriginal, setStatusOriginal] = useState("");

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
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
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
        setStatusOriginal(adiant.status ?? "pendente");
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const normNum = (s: string) => parseFloat(s.replace(",", "."));

  const doSave = async () => {
    setSaving(true);
    const valorNum = normNum(f.valor);
    const vpContasNum = f.valor_prestado_contas ? normNum(f.valor_prestado_contas) : null;

    const { error: dbErr } = await supabase.from("adiantamentos").update({
      motorista_id: f.motorista_id,
      tipo: f.tipo,
      valor: valorNum,
      justificativa: f.justificativa || null,
      data_pagamento: f.data_pagamento || null,
      status: f.status,
      recusa_motivo: f.status === "recusado" ? (f.recusa_motivo || null) : null,
      valor_prestado_contas: f.status === "prestado" && vpContasNum != null && !isNaN(vpContasNum)
        ? vpContasNum
        : null,
    }).eq("id", id);
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
    if (f.status === "recusado" && !f.recusa_motivo.trim()) { setErr("Informe o motivo da recusa"); return; }
    if (f.valor_prestado_contas && isNaN(normNum(f.valor_prestado_contas))) { setErr("Valor prestado em contas inválido. Use ponto ou vírgula como separador decimal."); return; }
    // "aprovado" libera pagamento e afeta o acerto do motorista — também pede
    // confirmação (dono: nada registrado sem alertar). Só quando o status mudou.
    const statusSensivel = f.status === "recusado" || f.status === "prestado" || f.status === "aprovado";
    if (statusSensivel && f.status !== statusOriginal) {
      setConfirmModal({ status: f.status });
      return;
    }
    await doSave();
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
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Valor Prestado em Contas (R$)">
                    <input
                      value={f.valor_prestado_contas}
                      onChange={set("valor_prestado_contas")}
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      placeholder="0,00"
                      style={inputStyle}
                    />
                  </FormField>
                </div>
              )}
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

      {/* Modal de confirmação para status recusado/prestado */}
      {confirmModal && (
        <div className="m-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="m-modal-body">
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e293b", marginBottom: "8px" }}>Confirmar alteração</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "20px" }}>
                Você está marcando este adiantamento como <strong>{confirmModal.status}</strong>. Esta ação afeta o acerto do motorista. Confirmar?
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <Btn variant="outline" onClick={() => setConfirmModal(null)}>Voltar</Btn>
                <Btn variant="danger" loading={saving} onClick={async () => { setConfirmModal(null); await doSave(); }}>Confirmar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

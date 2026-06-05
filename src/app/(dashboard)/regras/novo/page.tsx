"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn } from "@/components/ui/ds";
import {
  REGRA_TIPOS, REGRA_TIPO_LABEL, REGRA_PUBLICOS, regraSchema,
  type RegraTipo, type RegraPublico,
} from "@/lib/schemas/regra";

export default function NovaRegraPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    tipo: "consultar" as RegraTipo,
    prioridade: 0,
    ativa: true,
    exige_confirmacao: false,
    frasesText: "",      // uma frase por linha
    negativasText: "",   // uma frase por linha
    resposta: "",
    observacao: "",
    quem: ["qualquer"] as RegraPublico[],
  });

  const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

  const togglePublico = (p: RegraPublico) => {
    setForm((f) => {
      const has = f.quem.includes(p);
      let quem: RegraPublico[] = has ? f.quem.filter((x) => x !== p) : [...f.quem, p];
      // "qualquer" é exclusivo (sem trava): marcar qualquer limpa o resto, e vice-versa.
      if (!has && p === "qualquer") quem = ["qualquer"];
      else if (!has && p !== "qualquer") quem = quem.filter((x) => x !== "qualquer");
      if (quem.length === 0) quem = ["qualquer"];
      return { ...f, quem };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const parsed = regraSchema.safeParse({
      nome: form.nome.trim(),
      tipo: form.tipo,
      ativa: form.ativa,
      prioridade: Number(form.prioridade) || 0,
      frases_exemplo: linhas(form.frasesText),
      frases_negativas: linhas(form.negativasText),
      empresas_alvo: [],
      quem_pode_disparar: form.quem,
      resposta: form.resposta.trim(),
      exige_confirmacao: form.exige_confirmacao,
      observacao: form.observacao.trim(),
    });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("regras").insert({
      ...parsed.data,
      resposta: parsed.data.resposta || null,
      observacao: parsed.data.observacao || null,
    });
    setSaving(false);
    if (error) { setErro(error.message); return; }
    router.push("/regras");
    router.refresh();
  };

  const checkbox = (checked: boolean, onChange: () => void, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#334155" }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Nova Regra"
        actions={
          <>
            <Btn href="/regras" variant="ghost">← Voltar</Btn>
            <Btn href="/regras" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: 720 }}>

          {erro && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "13px" }}>
              {erro}
            </div>
          )}

          <FormSection title="Identificação">
            <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "16px" }}>
              <FormField label="Nome da regra *">
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} style={inputStyle} required />
              </FormField>
              <FormField label="Tipo *">
                <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as RegraTipo }))} style={selectStyle}>
                  {REGRA_TIPOS.map((t) => <option key={t} value={t}>{REGRA_TIPO_LABEL[t]}</option>)}
                </select>
              </FormField>
              <FormField label="Prioridade">
                <input type="number" value={form.prioridade} onChange={(e) => setForm((f) => ({ ...f, prioridade: Number(e.target.value) }))} style={inputStyle} />
              </FormField>
            </div>
            <div style={{ display: "flex", gap: "20px", marginTop: "8px" }}>
              {checkbox(form.ativa, () => setForm((f) => ({ ...f, ativa: !f.ativa })), "Ativa")}
              {checkbox(form.exige_confirmacao, () => setForm((f) => ({ ...f, exige_confirmacao: !f.exige_confirmacao })), "Exige confirmação antes de agir")}
            </div>
          </FormSection>

          <FormSection title="Frases (treino da IA)">
            <FormField label="Frases que DISPARAM a regra (uma por linha)">
              <textarea
                value={form.frasesText}
                onChange={(e) => setForm((f) => ({ ...f, frasesText: e.target.value }))}
                style={{ ...inputStyle, minHeight: 110, resize: "vertical", fontFamily: "inherit" }}
                placeholder={"qual o horário de entrega\nposso sair mais cedo"}
              />
            </FormField>
            <FormField label="Frases que NÃO devem disparar (opcional, uma por linha)">
              <textarea
                value={form.negativasText}
                onChange={(e) => setForm((f) => ({ ...f, negativasText: e.target.value }))}
                style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
                placeholder={"nota fiscal"}
              />
            </FormField>
          </FormSection>

          {form.tipo === "consultar" && (
            <FormSection title="Resposta (Consultar)">
              <FormField label="Resposta que a IA dá quando a regra casa">
                <textarea
                  value={form.resposta}
                  onChange={(e) => setForm((f) => ({ ...f, resposta: e.target.value }))}
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
                  placeholder="Ex: O horário de entrega é das 8h às 18h."
                />
              </FormField>
            </FormSection>
          )}

          {form.tipo === "registrar" && (
            <div style={{ padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "13px", color: "#92400e" }}>
              ⚠️ <b>Registrar</b> (a IA grava no banco) é a fase de risco — coleta de campos, seleção de tabelas e
              confirmação obrigatória vêm na próxima etapa. Ver <code>docs/MOTOR_REGRAS_ARQUITETURA.md</code>.
            </div>
          )}

          {form.tipo === "anotar" && (
            <div style={{ padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", color: "#166534" }}>
              ℹ️ <b>Anotar</b> funciona como o lembrete de hoje — grava a anotação no painel.
            </div>
          )}

          <FormSection title="Quem pode usar">
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {REGRA_PUBLICOS.map((p) =>
                checkbox(form.quem.includes(p), () => togglePublico(p), p === "qualquer" ? "Qualquer (sem trava)" : p)
              )}
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
              Empresas: por enquanto a regra vale para <b>todas</b> (sem trava). A seleção por empresa entra depois.
            </p>
          </FormSection>

          <FormSection title="Observação (opcional)">
            <FormField label="Anotação interna sobre a regra">
              <input value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} style={inputStyle} />
            </FormField>
          </FormSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
            <Btn href="/regras" variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar Regra"}</Btn>
          </div>
        </div>
      </div>
    </form>
  );
}

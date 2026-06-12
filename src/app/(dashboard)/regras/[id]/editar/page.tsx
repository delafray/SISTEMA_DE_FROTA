"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { temSessao } from "@/lib/auth/temSessao";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn } from "@/components/ui/ds";
import { REGRA_PUBLICOS, regraSchema, PRESETS_ACESSO, presetDeAcoes, type RegraPublico } from "@/lib/schemas/regra";

export default function EditarRegraPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fixa, setFixa] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    preset: "consultar",
    prioridade: 0,
    ativa: true,
    exige_confirmacao: false,
    gatilho_inicio: false,
    gatilhosText: "",
    frasesText: "",
    negativasText: "",
    resposta: "",
    observacao: "",
    quem: ["qualquer"] as RegraPublico[],
  });

  useEffect(() => {
    const load = async () => {
      if (!(await temSessao())) { router.replace("/login"); return; }
      const { data, error } = await supabase.from("regras").select("*").eq("id", id).single();
      if (error || !data) { setErro("Regra não encontrada."); setLoading(false); return; }
      setFixa(!!data.fixa);
      setForm({
        nome: data.nome ?? "",
        preset: presetDeAcoes(data.acoes ?? [], data.tipo ?? "consultar"),
        prioridade: data.prioridade ?? 0,
        ativa: !!data.ativa,
        exige_confirmacao: !!data.exige_confirmacao,
        gatilho_inicio: !!data.gatilho_inicio,
        gatilhosText: (data.gatilhos ?? []).join("\n"),
        frasesText: (data.frases_exemplo ?? []).join("\n"),
        negativasText: (data.frases_negativas ?? []).join("\n"),
        resposta: data.resposta ?? "",
        observacao: data.observacao ?? "",
        quem: ((data.quem_pode_disparar ?? ["qualquer"]) as RegraPublico[]),
      });
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  const presetAtual = PRESETS_ACESSO.find((p) => p.key === form.preset) ?? PRESETS_ACESSO[1];

  const togglePublico = (p: RegraPublico) => {
    setForm((f) => {
      const has = f.quem.includes(p);
      let quem: RegraPublico[] = has ? f.quem.filter((x) => x !== p) : [...f.quem, p];
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
      tipo: presetAtual.tipo,
      acoes: presetAtual.acoes,
      ativa: form.ativa,
      fixa,
      prioridade: Number(form.prioridade) || 0,
      gatilhos: linhas(form.gatilhosText),
      frases_exemplo: linhas(form.frasesText),
      frases_negativas: linhas(form.negativasText),
      empresas_alvo: [],
      quem_pode_disparar: form.quem,
      resposta: form.resposta.trim(),
      exige_confirmacao: form.exige_confirmacao,
      gatilho_inicio: form.gatilho_inicio,
      observacao: form.observacao.trim(),
    });
    if (!parsed.success) { setErro(parsed.error.issues[0]?.message ?? "Dados inválidos"); return; }
    setSaving(true);
    const { error } = await supabase.from("regras").update({
      ...parsed.data,
      resposta: parsed.data.resposta || null,
      observacao: parsed.data.observacao || null,
      atualizado_em: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) { setErro(error.message); return; }
    router.push("/regras");
    router.refresh();
  };

  const checkbox = (checked: boolean, onChange: () => void, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#334155", minHeight: 44 }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={fixa ? "Editar Regra (fixa)" : "Editar Regra"}
        actions={
          <>
            <Btn href="/regras" variant="ghost">← Voltar</Btn>
            <Btn href="/regras" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: 720 }}>
          {erro && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "13px" }}>{erro}</div>}
          {fixa && <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", color: "#1d4ed8", fontSize: "13px" }}>🔒 Regra <b>fixa</b> — sempre a primeira, não pode ser apagada. Você pode editar gatilhos e frases.</div>}

          <FormSection title="Identificação">
            <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "16px" }}>
              <FormField label="Nome da regra *">
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} style={inputStyle} required />
              </FormField>
              <FormField label="Acesso *">
                <select value={form.preset} disabled={fixa} onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))} style={{ ...selectStyle, opacity: fixa ? 0.6 : 1 }}>
                  {PRESETS_ACESSO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
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

          <FormSection title="Gatilhos (palavras que disparam)">
            <FormField label="Gatilhos — a primeira palavra/expressão que dispara (uma por linha)">
              <textarea value={form.gatilhosText} onChange={(e) => setForm((f) => ({ ...f, gatilhosText: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }} placeholder={"anota\nanote\nlembrete\nme lembra"} />
            </FormField>
            <div style={{ marginTop: 8 }}>
              {checkbox(form.gatilho_inicio, () => setForm((f) => ({ ...f, gatilho_inicio: !f.gatilho_inicio })), "Exigir gatilho como PRIMEIRA palavra (senão pula a regra)")}
            </div>
            {form.gatilho_inicio && (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
                ⚠️ A regra só vai disparar se a mensagem <b>começar</b> com um dos gatilhos acima. Ex: “lembrete comprar pneu” dispara; “comprar pneu” não.
              </p>
            )}
          </FormSection>

          <FormSection title="Frases-exemplo (treino da IA)">
            <FormField label="Frases que DISPARAM a regra (uma por linha)">
              <textarea value={form.frasesText} onChange={(e) => setForm((f) => ({ ...f, frasesText: e.target.value }))} style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} />
            </FormField>
            <FormField label="Frases que NÃO devem disparar (opcional)">
              <textarea value={form.negativasText} onChange={(e) => setForm((f) => ({ ...f, negativasText: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} />
            </FormField>
          </FormSection>

          {presetAtual.acoes.includes("consultar") && (
            <FormSection title="Resposta (Consultar)">
              <FormField label="Resposta que a IA dá quando a regra casa">
                <textarea value={form.resposta} onChange={(e) => setForm((f) => ({ ...f, resposta: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }} />
              </FormField>
            </FormSection>
          )}

          <FormSection title="Quem pode usar">
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {REGRA_PUBLICOS.map((p) => checkbox(form.quem.includes(p), () => togglePublico(p), p === "qualquer" ? "Qualquer (sem trava)" : p))}
            </div>
          </FormSection>

          <FormSection title="Observação (opcional)">
            <FormField label="Anotação interna sobre a regra">
              <input value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} style={inputStyle} />
            </FormField>
          </FormSection>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            <Btn href={`/regras/${id}/dados`} variant="outline">📊 Tabelas e campos</Btn>
            <div style={{ display: "flex", gap: "12px" }}>
              <Btn href="/regras" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

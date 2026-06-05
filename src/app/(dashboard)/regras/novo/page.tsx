"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn } from "@/components/ui/ds";
import { REGRA_PUBLICOS, regraSchema, PRESETS_ACESSO, type RegraPublico } from "@/lib/schemas/regra";

export default function NovaRegraPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    preset: "consultar",
    prioridade: 0,
    ativa: true,
    exige_confirmacao: false,
    gatilhosText: "",    // uma palavra-gatilho por linha
    frasesText: "",      // uma frase por linha
    negativasText: "",   // uma frase por linha
    resposta: "",
    observacao: "",
    quem: ["qualquer"] as RegraPublico[],
  });

  const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  const presetAtual = PRESETS_ACESSO.find((p) => p.key === form.preset) ?? PRESETS_ACESSO[1];

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
      tipo: presetAtual.tipo,
      acoes: presetAtual.acoes,
      ativa: form.ativa,
      fixa: false,
      prioridade: Number(form.prioridade) || 0,
      gatilhos: linhas(form.gatilhosText),
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

          <div style={{ padding: "12px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, fontSize: 13, color: "#075985", lineHeight: 1.6 }}>
            <b>📌 Como preencher (capriche — é isto que faz a IA acertar):</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li><b>Acesso</b> — o que a regra PODE fazer. <i>Consultar</i> = só lê · <i>Alterar</i> = muda algo que já existe · <i>Registrar</i> = cria novo. A matriz nunca oferece uma ação que a regra não tem.</li>
              <li><b>Gatilhos</b> — as palavras-chave que disparam (ex: “km do”, “manutenção”). É o disparo mais direto — o que mais ajuda a IA a acertar.</li>
              <li><b>Frases-exemplo</b> — frases completas, como o usuário falaria. Quanto mais variadas e reais, melhor a IA distingue esta regra das outras (mín. 3).</li>
              <li><b>Frases negativas</b> — frases parecidas que NÃO são esta regra (evita falso-positivo).</li>
              <li><b>Prioridade</b> — desempate quando 2 regras casam (maior vem primeiro). <b>Exige confirmação</b> — pra ações que gravam, a IA pergunta “confirma?” antes.</li>
            </ul>
            <div style={{ marginTop: 6, color: "#0369a1" }}>Cadastrou? Teste em <b>🔎 Contexto IA</b> e ajuste. Se algo atrapalhar, é só <b>editar</b> ou <b>excluir</b> a regra — sem código.</div>
          </div>

          <FormSection title="Identificação">
            <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "16px" }}>
              <FormField label="Nome da regra *">
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} style={inputStyle} required />
              </FormField>
              <FormField label="Acesso *">
                <select value={form.preset} onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))} style={selectStyle}>
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
              <textarea
                value={form.gatilhosText}
                onChange={(e) => setForm((f) => ({ ...f, gatilhosText: e.target.value }))}
                style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
                placeholder={"anota\nanote\nlembrete\nme lembra\nguarda"}
              />
            </FormField>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: -4 }}>
              O <b>gatilho</b> é o disparo direto (ex: a frase começa com “anota…”). As <b>frases-exemplo</b> abaixo são exemplos completos pro classificador.
            </p>
          </FormSection>

          <FormSection title="Frases-exemplo (treino da IA)">
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

          {presetAtual.acoes.includes("consultar") && (
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

          {(presetAtual.acoes.includes("alterar") || presetAtual.acoes.includes("registrar")) && (
            <div style={{ padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "13px", color: "#92400e" }}>
              ⚠️ <b>Alterar/Registrar</b> (a IA grava no banco) é a fase de risco — coleta de campos, escopo e
              confirmação obrigatória vêm com o motor de execução. Ver <code>docs/MOTOR_REGRAS_ARQUITETURA.md</code>.
            </div>
          )}

          {presetAtual.key === "anotar" && (
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

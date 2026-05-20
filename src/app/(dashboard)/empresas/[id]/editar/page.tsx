"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { PageHeader, FormSection, FormField, inputStyle, Btn, Alert } from "@/components/ui/ds";

const fmtCnpj = (v: string) => v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
const fmtTel  = (v: string) => v.length === 11
  ? v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
  : v.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
const fmtCep  = (v: string) => v.replace(/(\d{5})(\d{3})/, "$1-$2");

export default function EditarEmpresaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  const [form, setForm] = useState({
    nome_fantasia: "", razao_social: "", cnpj: "", inscricao_estadual: "",
    telefone: "", email: "", cep: "", logradouro: "", numero: "",
    complemento: "", bairro: "", cidade: "", uf: "",
  });

  useEffect(() => {
    supabase.from("empresas").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setForm({
        nome_fantasia:      data.nome_fantasia ?? "",
        razao_social:       data.razao_social ?? "",
        cnpj:               fmtCnpj(data.cnpj ?? ""),
        inscricao_estadual: data.inscricao_estadual ?? "",
        telefone:           fmtTel(data.telefone ?? ""),
        email:              data.email ?? "",
        cep:                fmtCep(data.cep ?? ""),
        logradouro:         data.logradouro ?? "",
        numero:             data.numero ?? "",
        complemento:        data.complemento ?? "",
        bairro:             data.bairro ?? "",
        cidade:             data.cidade ?? "",
        uf:                 data.uf ?? "",
      });
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  const handleCepBlur = async () => {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const data = await buscarCep(form.cep);
    if (data) setForm(f => ({
      ...f,
      logradouro: data.logradouro.toUpperCase(),
      bairro:     data.bairro.toUpperCase(),
      cidade:     data.localidade.toUpperCase(),
      uf:         data.uf.toUpperCase(),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.nome_fantasia) { setErr("Nome Fantasia é obrigatório"); return; }
    setSaving(true);
    const { error } = await supabase.from("empresas").update({
      nome_fantasia:      form.nome_fantasia,
      razao_social:       form.razao_social || null,
      cnpj:               form.cnpj.replace(/\D/g, ""),
      inscricao_estadual: form.inscricao_estadual || null,
      telefone:           form.telefone.replace(/\D/g, "") || null,
      email:              form.email.toLowerCase() || null,
      cep:                form.cep.replace(/\D/g, "") || null,
      logradouro:         form.logradouro || null,
      numero:             form.numero || null,
      complemento:        form.complemento || null,
      bairro:             form.bairro || null,
      cidade:             form.cidade || null,
      uf:                 form.uf || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    router.push("/empresas"); router.refresh();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Editar Empresa — ${form.nome_fantasia || "..."}`}
        actions={
          <>
            <Btn href="/empresas" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/empresas" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <FormSection title="Dados da Empresa">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="CNPJ">
                  <IMaskInput mask="00.000.000/0000-00" value={form.cnpj}
                    onAccept={(v) => setForm(f => ({ ...f, cnpj: v as string }))}
                    style={inputStyle} />
                </FormField>
                <div style={{ gridColumn: "span 3" }}>
                  <FormField label="Razão Social">
                    <input value={form.razao_social} onChange={set("razao_social")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Nome Fantasia *">
                    <input value={form.nome_fantasia} onChange={set("nome_fantasia")} style={{ ...inputStyle, textTransform: "uppercase" }} required />
                  </FormField>
                </div>
                <FormField label="Insc. Estadual">
                  <input value={form.inscricao_estadual} onChange={set("inscricao_estadual")} style={inputStyle} />
                </FormField>
                <FormField label="Telefone">
                  <IMaskInput mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]}
                    value={form.telefone}
                    onAccept={(v) => setForm(f => ({ ...f, telefone: v as string }))}
                    style={inputStyle} />
                </FormField>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="E-mail">
                    <input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                      type="email" style={inputStyle} />
                  </FormField>
                </div>
              </div>
            </FormSection>

            <FormSection title="Endereço">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="CEP (Busca Automática)">
                  <IMaskInput mask="00000-000" value={form.cep}
                    onAccept={(v) => setForm(f => ({ ...f, cep: v as string }))}
                    onBlur={handleCepBlur}
                    style={{ ...inputStyle, background: "#f0f9ff", borderColor: "#bae6fd" }} />
                </FormField>
                <div style={{ gridColumn: "span 3" }}>
                  <FormField label="Logradouro">
                    <input value={form.logradouro} onChange={set("logradouro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                </div>
                <FormField label="Número">
                  <input value={form.numero} onChange={set("numero")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                </FormField>
                <FormField label="Complemento">
                  <input value={form.complemento} onChange={set("complemento")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                </FormField>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Bairro">
                    <input value={form.bairro} onChange={set("bairro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                </div>
                <div style={{ gridColumn: "span 3" }}>
                  <FormField label="Cidade">
                    <input value={form.cidade} onChange={set("cidade")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                </div>
                <FormField label="UF">
                  <input value={form.uf} onChange={set("uf")} maxLength={2}
                    style={{ ...inputStyle, textTransform: "uppercase", textAlign: "center" }} />
                </FormField>
              </div>
            </FormSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/empresas" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Atualizar Empresa"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";
import { EmpresaSelect } from "@/components/ui/EmpresaSelect";

export default function NovoMotoristaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [tab, setTab] = useState<"dados" | "cnh" | "remuneracao" | "endereco">("dados");

  const [f, setF] = useState({
    nome: "", cpf: "", whatsapp: "", rg: "", data_nascimento: "", email: "",
    data_admissao: "", cargo: "",
    cnh_numero: "", cnh_categoria: "E", cnh_validade: "", cnh_primeira_habilitacao: "", cnh_ear: false,
    salario_fixo: "", valor_diaria_por_pedido: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleCepBlur = async () => {
    const digits = f.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const data = await buscarCep(f.cep);
    if (data) setF(p => ({ ...p, logradouro: data.logradouro.toUpperCase(), bairro: data.bairro.toUpperCase(), cidade: data.localidade.toUpperCase(), uf: data.uf.toUpperCase() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.nome || !f.cpf || !f.whatsapp || !f.cnh_numero || !f.cnh_validade) {
      setErr("Preencha os campos obrigatórios: Nome, CPF, WhatsApp, CNH e Validade CNH"); return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); setErr("Não autenticado"); return; }
    if (!empresaId) { setSaving(false); setErr("Selecione a empresa"); return; }

    const { error: dbErr } = await supabase.from("motoristas").insert({
      empresa_id: empresaId,
      nome: f.nome.toUpperCase(),
      cpf: f.cpf.replace(/\D/g, ""),
      whatsapp: f.whatsapp.replace(/\D/g, "").replace(/^(55)?/, "55").slice(0, 13),
      rg: f.rg || null,
      data_nascimento: f.data_nascimento || null,
      email: f.email.toLowerCase() || null,
      data_admissao: f.data_admissao || null,
      cargo: f.cargo || null,
      cnh_numero: f.cnh_numero,
      cnh_categoria: f.cnh_categoria,
      cnh_validade: f.cnh_validade,
      cnh_primeira_habilitacao: f.cnh_primeira_habilitacao || null,
      cnh_ear: f.cnh_ear,
      salario_fixo: f.salario_fixo ? parseFloat(f.salario_fixo) : null,
      valor_diaria_por_pedido: f.valor_diaria_por_pedido ? parseFloat(f.valor_diaria_por_pedido) : null,
      cep: f.cep.replace(/\D/g, "") || null,
      logradouro: f.logradouro || null, numero: f.numero || null,
      complemento: f.complemento || null, bairro: f.bairro || null,
      cidade: f.cidade || null, uf: f.uf || null,
      ativo: true,
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/motoristas"); router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Cadastrar Motorista"
        actions={
          <>
            <Btn href="/motoristas" variant="ghost">← Voltar</Btn>
            <Btn href="/motoristas" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={[
            { id: "dados",       label: "Dados Pessoais" },
            { id: "cnh",         label: "CNH" },
            { id: "remuneracao", label: "Remuneração" },
            { id: "endereco",    label: "Endereço" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ maxWidth: 320, marginBottom: 24 }}>
            <EmpresaSelect value={empresaId} onChange={setEmpresaId} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* ABA: DADOS PESSOAIS */}
            <div style={{ display: tab === "dados" ? "block" : "none" }}>
              <FormSection title="Dados Pessoais">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Nome Completo *">
                      <input value={f.nome} onChange={(e) => setF(p => ({ ...p, nome: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="CPF *">
                    <IMaskInput mask="000.000.000-00" onAccept={(v) => setF(p => ({ ...p, cpf: v as string }))} style={inputStyle} />
                  </FormField>
                  <FormField label="RG">
                    <input value={f.rg} onChange={set("rg")} style={inputStyle} />
                  </FormField>
                  <FormField label="WhatsApp *">
                    <IMaskInput mask="(00) 00000-0000" onAccept={(v) => setF(p => ({ ...p, whatsapp: v as string }))} style={inputStyle} />
                  </FormField>
                  <FormField label="Nascimento">
                    <input value={f.data_nascimento} onChange={set("data_nascimento")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="Admissão">
                    <input value={f.data_admissao} onChange={set("data_admissao")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="Cargo">
                    <input value={f.cargo} onChange={set("cargo")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="MOTORISTA" />
                  </FormField>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="E-mail">
                      <input value={f.email} onChange={(e) => setF(p => ({ ...p, email: e.target.value }))} type="email" style={inputStyle} />
                    </FormField>
                  </div>
                </div>
              </FormSection>
            </div>

            {/* ABA: CNH */}
            <div style={{ display: tab === "cnh" ? "block" : "none" }}>
              <FormSection title="Habilitação (CNH)">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Número CNH *">
                      <IMaskInput mask="00000000000" onAccept={(v) => setF(p => ({ ...p, cnh_numero: v as string }))} style={inputStyle} />
                    </FormField>
                  </div>
                  <FormField label="Categoria *">
                    <select value={f.cnh_categoria} onChange={set("cnh_categoria")} style={selectStyle}>
                      {["A","B","C","D","E","AB","AC","AD","AE"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Validade *">
                    <input value={f.cnh_validade} onChange={set("cnh_validade")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="1ª Habilitação">
                    <input value={f.cnh_primeira_habilitacao} onChange={set("cnh_primeira_habilitacao")} type="date" style={inputStyle} />
                  </FormField>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "10px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" checked={f.cnh_ear} onChange={(e) => setF(p => ({ ...p, cnh_ear: e.target.checked }))} style={{ width: "16px", height: "16px", accentColor: "#2563eb" }} />
                      <span style={{ fontSize: "13px", color: "#334155" }}>EAR (Ativ. Remunerada)</span>
                    </label>
                  </div>
                </div>
              </FormSection>
            </div>

            {/* ABA: REMUNERAÇÃO */}
            <div style={{ display: tab === "remuneracao" ? "block" : "none" }}>
              <FormSection title="Remuneração">
                <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
                  Motorista recebe salário fixo mensal e/ou diária por pedido concluído.
                </p>
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Salário Fixo Mensal (R$)">
                      <input value={f.salario_fixo} onChange={set("salario_fixo")} type="number" step="0.01" style={inputStyle} placeholder="0,00" />
                    </FormField>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Valor da Diária por Pedido (R$)">
                      <input value={f.valor_diaria_por_pedido} onChange={set("valor_diaria_por_pedido")} type="number" step="0.01" style={inputStyle} placeholder="0,00" />
                    </FormField>
                  </div>
                </div>
              </FormSection>
            </div>

            {/* ABA: ENDEREÇO */}
            <div style={{ display: tab === "endereco" ? "block" : "none" }}>
              <FormSection title="Endereço">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <FormField label="CEP">
                    <IMaskInput mask="00000-000" onAccept={(v) => setF(p => ({ ...p, cep: v as string }))}
                      onBlur={handleCepBlur}
                      style={{ ...inputStyle, background: "#f0f9ff", borderColor: "#bae6fd" }} />
                  </FormField>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Logradouro">
                      <input value={f.logradouro} onChange={set("logradouro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="Número">
                    <input value={f.numero} onChange={set("numero")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                  <FormField label="Complemento">
                    <input value={f.complemento} onChange={set("complemento")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Bairro">
                      <input value={f.bairro} onChange={set("bairro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Cidade">
                      <input value={f.cidade} onChange={set("cidade")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="UF">
                    <input value={f.uf} onChange={set("uf")} maxLength={2} style={{ ...inputStyle, textTransform: "uppercase", textAlign: "center" }} />
                  </FormField>
                </div>
              </FormSection>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/motoristas" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar Motorista"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

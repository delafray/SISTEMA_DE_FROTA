"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { Plus, Trash2, User } from "lucide-react";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn } from "@/components/ui/ds";

// --- Schemas ---
const contatoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório").toUpperCase(),
  cargo: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  principal: z.boolean(),
});

const clienteComContatosSchema = z.object({
  cnpj_cpf: z.string().min(14, "Documento inválido"),
  razao_social: z.string().min(3, "Razão Social obrigatória").toUpperCase(),
  nome_fantasia: z.string().optional(),
  apelido: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  cep: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  status: z.enum(["ATIVO", "INATIVO"]),
  contatos: z.array(contatoSchema),
});

type ClienteComContatosData = z.infer<typeof clienteComContatosSchema>;

export default function NovoClientePage() {
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"dados" | "contatos">("dados");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClienteComContatosData>({
    resolver: zodResolver(clienteComContatosSchema),
    defaultValues: { status: "ATIVO", contatos: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contatos",
  });

  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value;
    if (cep.replace(/\D/g, "").length === 8) {
      const data = await buscarCep(cep);
      if (data) {
        setValue("endereco", data.logradouro.toUpperCase(), { shouldValidate: true });
        setValue("bairro", data.bairro.toUpperCase(), { shouldValidate: true });
        setValue("cidade", data.localidade.toUpperCase(), { shouldValidate: true });
        setValue("uf", data.uf.toUpperCase(), { shouldValidate: true });
        document.getElementById("numero")?.focus();
      }
    }
  };

  const adicionarContato = () => {
    append({ nome: "", cargo: "", telefone: "", whatsapp: "", email: "", principal: false });
  };

  const onSubmit = async (data: ClienteComContatosData) => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    // Cliente é COMPARTILHADO entre os sócios (não pertence a uma empresa) — usa a padrão.
    const { data: emp } = await supabase.from("empresas").select("id").limit(1).maybeSingle();
    if (!emp?.id) { alert("Nenhuma empresa cadastrada."); return; }
    const empresa_id = emp.id;

        const { data: clienteSalvo, error: clienteError } = await supabase
      .from("clientes")
      .insert({
        empresa_id,
        documento: data.cnpj_cpf.replace(/\D/g, ""),
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || data.razao_social,
        apelido: data.apelido || null,
        tipo_pessoa: data.cnpj_cpf.replace(/\D/g, "").length === 11 ? "fisica" : "juridica",
        telefone: data.telefone?.replace(/\D/g, "") || null,
        email: data.email || null,
        cep: data.cep?.replace(/\D/g, "") || null,
        logradouro: data.endereco || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        cidade: data.cidade || null,
        uf: data.uf || null,
        ativo: data.status === "ATIVO",
      })
      .select("id")
      .single();

    if (clienteError) { alert("Erro ao salvar cliente: " + clienteError.message); return; }

    if (data.contatos.length > 0 && clienteSalvo?.id) {
      const contatosParaSalvar = data.contatos.map((c) => ({
        empresa_id,
        cliente_id: clienteSalvo.id,
        nome: c.nome,
        cargo: c.cargo || null,
        telefone: c.telefone?.replace(/\D/g, "") || null,
        whatsapp: c.whatsapp?.replace(/\D/g, "") || null,
        email: c.email || null,
        principal: c.principal,
      }));
      const { error: contatosError } = await supabase.from("cliente_contatos").insert(contatosParaSalvar);
      if (contatosError) console.warn("Erro ao salvar contatos:", contatosError.message);
    }

    router.push("/clientes"); router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Cadastrar Cliente"
        actions={
          <>
            <Btn href="/clientes" variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar Cliente"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px", color: "#3b82f6", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>ℹ️</span> Preencha os dados básicos e salve para liberar o cadastro de endereços e contatos adicionais.
          </div>
          
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "24px", overflowX: "auto" }}>
            <button type="button" onClick={() => setActiveTab("dados")}
              style={{
                padding: "10px 20px", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                borderBottom: `2px solid ${activeTab === "dados" ? "#2563eb" : "transparent"}`,
                color: activeTab === "dados" ? "#2563eb" : "#64748b",
                background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none",
                cursor: "pointer", transition: "all 150ms", marginBottom: "-1px",
                minHeight: "44px", whiteSpace: "nowrap",
              }}>
              Dados Básicos
            </button>
            <button type="button" onClick={() => setActiveTab("contatos")}
              style={{
                padding: "10px 20px", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                borderBottom: `2px solid ${activeTab === "contatos" ? "#2563eb" : "transparent"}`,
                color: activeTab === "contatos" ? "#2563eb" : "#64748b",
                background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none",
                cursor: "pointer", transition: "all 150ms", marginBottom: "-1px",
                minHeight: "44px", whiteSpace: "nowrap",
              }}>
              Contatos
              {fields.length > 0 && <span style={{ marginLeft: "8px", background: "#2563eb", color: "#fff", fontSize: "10px", padding: "2px 6px", borderRadius: "10px" }}>{fields.length}</span>}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* ABA: DADOS DO CLIENTE */}
            <div style={{ display: activeTab === "dados" ? "block" : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <FormSection title="Dados Principais">
                  <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                    <FormField label="CNPJ / CPF">
                      <IMaskInput mask={[{ mask: "000.000.000-00" }, { mask: "00.000.000/0000-00" }]}
                        onAccept={(val) => setValue("cnpj_cpf", val as string, { shouldValidate: true })}
                        inputMode="numeric"
                        style={inputStyle} />
                      {errors.cnpj_cpf && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.cnpj_cpf.message}</p>}
                    </FormField>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Razão Social / Nome">
                        <input {...register("razao_social")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                        {errors.razao_social && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.razao_social.message}</p>}
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Nome Fantasia">
                        <input {...register("nome_fantasia")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Apelido (para busca pela IA)">
                        <input {...register("apelido")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="Ex: Boi Nobre, Dona Maria..." />
                      </FormField>
                    </div>
                    <FormField label="Telefone">
                      <IMaskInput mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]} onAccept={(val) => setValue("telefone", val as string)} inputMode="tel" style={inputStyle} />
                    </FormField>
                    <FormField label="E-mail">
                      <input {...register("email")} type="email" style={inputStyle} />
                      {errors.email && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.email.message}</p>}
                    </FormField>
                    <FormField label="Status">
                      <select {...register("status")} style={selectStyle}>
                        <option value="ATIVO">ATIVO</option>
                        <option value="INATIVO">INATIVO</option>
                      </select>
                    </FormField>
                  </div>
                </FormSection>

                <FormSection title="Endereço">
                  <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                    <FormField label="CEP (Busca Automática)">
                      <IMaskInput mask="00000-000" onAccept={(val) => setValue("cep", val as string)} onBlur={handleCepBlur} inputMode="numeric" style={{ ...inputStyle, background: "#f0f9ff", borderColor: "#bae6fd" }} placeholder="00000-000" />
                      {errors.cep && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.cep.message}</p>}
                    </FormField>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Logradouro / Endereço">
                        <input {...register("endereco")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <FormField label="Número">
                      <input {...register("numero")} id="numero" type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                    <FormField label="Complemento">
                      <input {...register("complemento")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Bairro">
                        <input {...register("bairro")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Cidade">
                        <input {...register("cidade")} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <FormField label="UF">
                      <input {...register("uf")} type="text" maxLength={2} style={{ ...inputStyle, textTransform: "uppercase", textAlign: "center" }} />
                    </FormField>
                  </div>
                </FormSection>
              </div>
            </div>

            {/* ABA: CONTATOS */}
            <div style={{ display: activeTab === "contatos" ? "block" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ color: "#64748b", fontSize: "14px" }}>Adicione os contatos responsáveis (compradores, logística, etc.)</p>
                <button type="button" onClick={adicionarContato}
                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={16} /> Adicionar Contato
                </button>
              </div>

              {fields.length === 0 ? (
                <div style={{ padding: "48px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "12px", textAlign: "center" }}>
                  <User size={32} style={{ margin: "0 auto 12px", color: "#94a3b8" }} />
                  <p style={{ color: "#475569", fontSize: "14px", fontWeight: 500 }}>Nenhum contato adicionado.</p>
                  <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>Clique em &ldquo;+ Adicionar Contato&rdquo; para incluir responsáveis.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {fields.map((field, index) => (
                    <FormSection key={field.id} title={`Contato #${index + 1}`}>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-36px", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <input type="checkbox" {...register(`contatos.${index}.principal`)} style={{ accentColor: "#2563eb" }} />
                            <span style={{ fontSize: "13px", color: "#475569" }}>Principal</span>
                          </label>
                          <button type="button" onClick={() => remove(index)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex" }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Nome">
                            <input {...register(`contatos.${index}.nome`)} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="Nome do responsável" />
                            {errors.contatos?.[index]?.nome && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.contatos[index]?.nome?.message}</p>}
                          </FormField>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Cargo / Setor">
                            <input {...register(`contatos.${index}.cargo`)} type="text" style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="Ex: Gerente de Logística" />
                          </FormField>
                        </div>
                        <FormField label="Telefone">
                          <IMaskInput mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]} onAccept={(val) => setValue(`contatos.${index}.telefone`, val as string)} inputMode="tel" style={inputStyle} />
                        </FormField>
                        <FormField label="WhatsApp">
                          <IMaskInput mask="(00) 00000-0000" onAccept={(val) => setValue(`contatos.${index}.whatsapp`, val as string)} inputMode="tel" style={inputStyle} />
                        </FormField>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="E-mail">
                            <input {...register(`contatos.${index}.email`)} type="email" style={inputStyle} placeholder="email@empresa.com.br" />
                            {errors.contatos?.[index]?.email && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.contatos[index]?.email?.message}</p>}
                          </FormField>
                        </div>
                      </div>
                    </FormSection>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/clientes" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Cliente"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

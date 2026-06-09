"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { Plus, Trash2, User, MapPin } from "lucide-react";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

const fmtDoc = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
};

const contatoSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(2, "Nome obrigatório").toUpperCase(),
  cargo: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  principal: z.boolean(),
});

const clienteSchema = z.object({
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

type ClienteData = z.infer<typeof clienteSchema>;

type LocalCarregamento = {
  id?: string;
  nome: string;
  endereco: string;
  principal: boolean;
};

export default function EditarClientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"dados" | "contatos" | "locais">("dados");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Locais de Carregamento (gerenciado fora do react-hook-form)
  const [locais, setLocais] = useState<LocalCarregamento[]>([]);

  const { register, handleSubmit, setValue, control, reset, formState: { errors, isSubmitting } } =
    useForm<ClienteData>({
      resolver: zodResolver(clienteSchema),
      defaultValues: { status: "ATIVO", contatos: [] },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "contatos" });

  useEffect(() => {
    const load = async () => {
      const [{ data: cliente }, { data: contatos }, { data: locaisData }] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", id).single(),
        supabase.from("cliente_contatos").select("*").eq("cliente_id", id).order("principal", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("locais_carregamento").select("*").eq("cliente_id", id).eq("ativo", true).order("principal", { ascending: false }),
      ]);
      if (cliente) {
        reset({
          cnpj_cpf: fmtDoc(cliente.documento ?? ""),
          razao_social: cliente.razao_social ?? "",
          nome_fantasia: cliente.nome_fantasia ?? "",
          apelido: (cliente as any).apelido ?? "",
          telefone: cliente.telefone ?? "",
          email: cliente.email ?? "",
          cep: cliente.cep ?? "",
          endereco: cliente.logradouro ?? "",
          numero: cliente.numero ?? "",
          complemento: cliente.complemento ?? "",
          bairro: cliente.bairro ?? "",
          cidade: cliente.cidade ?? "",
          uf: cliente.uf ?? "",
          status: cliente.ativo !== false ? "ATIVO" : "INATIVO",
          contatos: (contatos ?? []).map(c => ({
            id: c.id,
            nome: c.nome ?? "",
            cargo: c.cargo ?? "",
            telefone: c.telefone ?? "",
            whatsapp: c.whatsapp ?? "",
            email: c.email ?? "",
            principal: c.principal ?? false,
          })),
        });
      }
      setLocais((locaisData ?? []).map((l: any) => ({
        id: l.id,
        nome: l.nome ?? "",
        endereco: l.endereco ?? "",
        principal: l.principal ?? false,
      })));
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value;
    if (cep.replace(/\D/g, "").length === 8) {
      const data = await buscarCep(cep);
      if (data) {
        setValue("endereco", data.logradouro.toUpperCase(), { shouldValidate: true });
        setValue("bairro", data.bairro.toUpperCase(), { shouldValidate: true });
        setValue("cidade", data.localidade.toUpperCase(), { shouldValidate: true });
        setValue("uf", data.uf.toUpperCase(), { shouldValidate: true });
      }
    }
  };

  const onSubmit = async (data: ClienteData) => {
    setErr("");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id").eq("usuario_id", authData.user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setErr("Empresa não encontrada."); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: clienteError } = await supabase.from("clientes").update({
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
    } as any).eq("id", id);

    if (clienteError) { setErr("Erro ao atualizar cliente: " + clienteError.message); return; }

    await supabase.from("cliente_contatos").delete().eq("cliente_id", id);
    if (data.contatos.length > 0) {
      const contatos = data.contatos.map(c => ({
        empresa_id: ue.empresa_id,
        cliente_id: id,
        nome: c.nome,
        cargo: c.cargo || null,
        telefone: c.telefone?.replace(/\D/g, "") || null,
        whatsapp: c.whatsapp?.replace(/\D/g, "") || null,
        email: c.email || null,
        principal: c.principal,
      }));
      const { error: contatosError } = await supabase.from("cliente_contatos").insert(contatos);
      if (contatosError) console.warn("Erro ao salvar contatos:", contatosError.message);
    }

    // Salvar locais de carregamento (delete + reinsert)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("locais_carregamento").delete().eq("cliente_id", id);
    if (locais.length > 0) {
      const locaisPayload = locais.map(l => ({
        empresa_id: ue.empresa_id,
        cliente_id: id,
        nome: l.nome,
        endereco: l.endereco,
        principal: l.principal,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: locaisError } = await (supabase as any).from("locais_carregamento").insert(locaisPayload);
      if (locaisError) console.warn("Erro ao salvar locais:", locaisError.message);
    }

    router.push("/clientes"); router.refresh();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
    borderBottom: `2px solid ${active ? "#2563eb" : "transparent"}`,
    color: active ? "#2563eb" : "#64748b",
    background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none",
    cursor: "pointer", transition: "all 150ms", marginBottom: "-1px",
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Cliente"
        actions={
          <>
            <Btn href="/clientes" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/clientes" variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Atualizar Cliente"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "24px" }}>
            <button type="button" onClick={() => setActiveTab("dados")} style={tabStyle(activeTab === "dados")}>Dados Básicos</button>
            <button type="button" onClick={() => setActiveTab("contatos")} style={tabStyle(activeTab === "contatos")}>
              Contatos
              {fields.length > 0 && <span style={{ marginLeft: "8px", background: "#2563eb", color: "#fff", fontSize: "10px", padding: "2px 6px", borderRadius: "10px" }}>{fields.length}</span>}
            </button>
            <button type="button" onClick={() => setActiveTab("locais")} style={tabStyle(activeTab === "locais")}>
              Locais de Carregamento
              {locais.length > 0 && <span style={{ marginLeft: "8px", background: "#059669", color: "#fff", fontSize: "10px", padding: "2px 6px", borderRadius: "10px" }}>{locais.length}</span>}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            <div style={{ display: activeTab === "dados" ? "block" : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <FormSection title="Dados Principais">
                  <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                    <FormField label="CNPJ / CPF">
                      <IMaskInput mask={[{ mask: "000.000.000-00" }, { mask: "00.000.000/0000-00" }]}
                        value={typeof (register("cnpj_cpf") as unknown as {value?: string}).value === "string" ? undefined : undefined}
                        onAccept={(val) => setValue("cnpj_cpf", val as string, { shouldValidate: true })}
                        defaultValue={undefined}
                        style={inputStyle} />
                      {errors.cnpj_cpf && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.cnpj_cpf.message}</p>}
                    </FormField>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Razão Social / Nome">
                        <input {...register("razao_social")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                        {errors.razao_social && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.razao_social.message}</p>}
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Nome Fantasia">
                        <input {...register("nome_fantasia")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Apelido (para busca pela IA)">
                        <input {...register("apelido")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="Ex: Boi Nobre, Dona Maria..." />
                      </FormField>
                    </div>
                    <FormField label="Telefone">
                      <IMaskInput mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]}
                        onAccept={(val) => setValue("telefone", val as string)} style={inputStyle} />
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
                      <IMaskInput mask="00000-000" onAccept={(val) => setValue("cep", val as string)} onBlur={handleCepBlur}
                        style={{ ...inputStyle, background: "#f0f9ff", borderColor: "#bae6fd" }} />
                    </FormField>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Logradouro / Endereço">
                        <input {...register("endereco")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <FormField label="Número">
                      <input {...register("numero")} id="numero" style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                    <FormField label="Complemento">
                      <input {...register("complemento")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                    <div style={{ gridColumn: "span 2" }}>
                      <FormField label="Bairro">
                        <input {...register("bairro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <div style={{ gridColumn: "span 3" }}>
                      <FormField label="Cidade">
                        <input {...register("cidade")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                    </div>
                    <FormField label="UF">
                      <input {...register("uf")} maxLength={2} style={{ ...inputStyle, textTransform: "uppercase", textAlign: "center" }} />
                    </FormField>
                  </div>
                </FormSection>
              </div>
            </div>

            <div style={{ display: activeTab === "contatos" ? "block" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ color: "#64748b", fontSize: "14px" }}>Contatos responsáveis (compradores, logística, etc.)</p>
                <button type="button"
                  onClick={() => append({ nome: "", cargo: "", telefone: "", whatsapp: "", email: "", principal: false })}
                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={16} /> Adicionar Contato
                </button>
              </div>

              {fields.length === 0 ? (
                <div style={{ padding: "48px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "12px", textAlign: "center" }}>
                  <User size={32} style={{ margin: "0 auto 12px", color: "#94a3b8" }} />
                  <p style={{ color: "#475569", fontSize: "14px", fontWeight: 500 }}>Nenhum contato adicionado.</p>
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
                            <input {...register(`contatos.${index}.nome`)} style={{ ...inputStyle, textTransform: "uppercase" }} />
                            {errors.contatos?.[index]?.nome && <p style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>{errors.contatos[index]?.nome?.message}</p>}
                          </FormField>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Cargo / Setor">
                            <input {...register(`contatos.${index}.cargo`)} style={{ ...inputStyle, textTransform: "uppercase" }} />
                          </FormField>
                        </div>
                        <FormField label="Telefone">
                          <IMaskInput mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]} onAccept={(val) => setValue(`contatos.${index}.telefone`, val as string)} style={inputStyle} />
                        </FormField>
                        <FormField label="WhatsApp">
                          <IMaskInput mask="(00) 00000-0000" onAccept={(val) => setValue(`contatos.${index}.whatsapp`, val as string)} style={inputStyle} />
                        </FormField>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="E-mail">
                            <input {...register(`contatos.${index}.email`)} type="email" style={inputStyle} />
                          </FormField>
                        </div>
                      </div>
                    </FormSection>
                  ))}
                </div>
              )}
            </div>

            {/* ── ABA LOCAIS DE CARREGAMENTO ── */}
            <div style={{ display: activeTab === "locais" ? "block" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ color: "#64748b", fontSize: "14px" }}>Galpões, depósitos ou locais de carregamento do cliente.</p>
                <button type="button"
                  onClick={() => setLocais(prev => [...prev, { nome: "", endereco: "", principal: false }])}
                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#059669", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  <Plus size={16} /> Adicionar Local
                </button>
              </div>

              {locais.length === 0 ? (
                <div style={{ padding: "48px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "12px", textAlign: "center" }}>
                  <MapPin size={32} style={{ margin: "0 auto 12px", color: "#94a3b8" }} />
                  <p style={{ color: "#475569", fontSize: "14px", fontWeight: 500 }}>Nenhum local de carregamento cadastrado.</p>
                  <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: "4px" }}>Ex: Galpão Central, CD São Paulo, Filial Ribeirão...</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {locais.map((local, idx) => (
                    <FormSection key={idx} title={`Local #${idx + 1}`}>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-36px", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={local.principal}
                              onChange={e => {
                                setLocais(prev => prev.map((l, i) => ({
                                  ...l,
                                  principal: i === idx ? e.target.checked : (e.target.checked ? false : l.principal),
                                })));
                              }}
                              style={{ accentColor: "#059669" }}
                            />
                            <span style={{ fontSize: "13px", color: "#475569" }}>Principal</span>
                          </label>
                          <button type="button" onClick={() => setLocais(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex" }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
                        <FormField label="Nome do Local">
                          <input
                            value={local.nome}
                            onChange={e => setLocais(prev => prev.map((l, i) => i === idx ? { ...l, nome: e.target.value } : l))}
                            placeholder="Ex: Galpão Central"
                            style={{ ...inputStyle, textTransform: "uppercase" }}
                          />
                        </FormField>
                        <FormField label="Endereço">
                          <input
                            value={local.endereco}
                            onChange={e => setLocais(prev => prev.map((l, i) => i === idx ? { ...l, endereco: e.target.value } : l))}
                            placeholder="Rua, número, bairro, cidade - UF"
                            style={{ ...inputStyle, textTransform: "uppercase" }}
                          />
                        </FormField>
                      </div>
                    </FormSection>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/clientes" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Atualizar Cliente"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

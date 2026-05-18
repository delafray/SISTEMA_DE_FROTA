"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { Plus, Trash2, User } from "lucide-react";

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
  // Dados Principais
  cnpj_cpf: z.string().min(14, "Documento inválido"),
  razao_social: z.string().min(3, "Razão Social obrigatória").toUpperCase(),
  nome_fantasia: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  // Endereço
  cep: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  status: z.enum(["ATIVO", "INATIVO"]),
  // Contatos (sub-lista)
  contatos: z.array(contatoSchema),
});

type ClienteComContatosData = z.infer<typeof clienteComContatosSchema>;

// --- Estilos reutilizáveis ---
const inputClass =
  "w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500";
const labelClass =
  "block text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const errorClass = "text-red-400 text-[10px] mt-0.5";

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

    // Busca a empresa_id do usuário logado
    const { data: ue } = await supabase
      .from("usuario_empresas")
      .select("empresa_id")
      .eq("usuario_id", authData.user.id)
      .eq("is_padrao", true)
      .single();

    if (!ue?.empresa_id) {
      alert("Empresa não encontrada para este usuário.");
      return;
    }

    const empresa_id = ue.empresa_id;

    // 1. Salvar o Cliente
    const { data: clienteSalvo, error: clienteError } = await supabase
      .from("clientes")
      .insert({
        empresa_id,
        documento: data.cnpj_cpf.replace(/\D/g, ""),
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || data.razao_social,
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

    if (clienteError) {
      alert("Erro ao salvar cliente: " + clienteError.message);
      return;
    }

    // 2. Salvar os Contatos
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

      const { error: contatosError } = await supabase
        .from("cliente_contatos")
        .insert(contatosParaSalvar);

      if (contatosError) {
        console.warn("Erro ao salvar contatos:", contatosError.message);
      }
    }

    router.push("/clientes");
    router.refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-800">
        <Link href="/clientes" className="text-slate-400 hover:text-white transition-colors">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
          Cadastrar Cliente
        </h1>
      </div>

      {/* Abas */}
      <div className="flex border-b border-slate-700 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("dados")}
          className={`px-5 py-2 text-[12px] font-bold uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
            activeTab === "dados"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Dados do Cliente
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contatos")}
          className={`px-5 py-2 text-[12px] font-bold uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
            activeTab === "contatos"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Contatos{fields.length > 0 && (
            <span className="ml-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {fields.length}
            </span>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ===== ABA: DADOS DO CLIENTE ===== */}
        <div className={activeTab === "dados" ? "block space-y-4" : "hidden"}>
          {/* Bloco: Dados Principais */}
          <div className="bg-[#0f172a] border border-slate-700 p-4 space-y-4">
            <h2 className="text-slate-300 text-xs font-bold uppercase tracking-widest border-b border-slate-800 pb-2">
              Dados Principais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>CNPJ / CPF</label>
                <IMaskInput
                  mask={[{ mask: "000.000.000-00" }, { mask: "00.000.000/0000-00" }]}
                  onAccept={(val) => setValue("cnpj_cpf", val as string, { shouldValidate: true })}
                  className={inputClass}
                />
                {errors.cnpj_cpf && <p className={errorClass}>{errors.cnpj_cpf.message}</p>}
              </div>
              <div className="space-y-1 md:col-span-3">
                <label className={labelClass}>Razão Social / Nome</label>
                <input {...register("razao_social")} type="text" className={`${inputClass} uppercase`} />
                {errors.razao_social && <p className={errorClass}>{errors.razao_social.message}</p>}
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Nome Fantasia</label>
                <input {...register("nome_fantasia")} type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>Telefone</label>
                <IMaskInput
                  mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]}
                  onAccept={(val) => setValue("telefone", val as string)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>E-mail</label>
                <input {...register("email")} type="email" className={`${inputClass} lowercase`} />
                {errors.email && <p className={errorClass}>{errors.email.message}</p>}
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>Status</label>
                <select {...register("status")} className={`${inputClass} uppercase`}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bloco: Endereço */}
          <div className="bg-[#0f172a] border border-slate-700 p-4 space-y-4">
            <h2 className="text-slate-300 text-xs font-bold uppercase tracking-widest border-b border-slate-800 pb-2">
              Endereço
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>CEP (Busca Automática)</label>
                <IMaskInput
                  mask="00000-000"
                  onAccept={(val) => setValue("cep", val as string)}
                  onBlur={handleCepBlur}
                  className="w-full px-3 py-1.5 bg-blue-900/20 border border-blue-900/50 text-blue-200 text-[13px] rounded-none focus:outline-none focus:border-blue-500"
                  placeholder="00000-000"
                />
                {errors.cep && <p className={errorClass}>{errors.cep.message}</p>}
              </div>
              <div className="space-y-1 md:col-span-3">
                <label className={labelClass}>Logradouro / Endereço</label>
                <input {...register("endereco")} type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Número</label>
                <input {...register("numero")} id="numero" type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Complemento</label>
                <input {...register("complemento")} type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Bairro</label>
                <input {...register("bairro")} type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <label className={labelClass}>Cidade</label>
                <input {...register("cidade")} type="text" className={`${inputClass} uppercase`} />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className={labelClass}>UF</label>
                <input {...register("uf")} type="text" maxLength={2} className={`${inputClass} uppercase text-center`} />
              </div>
            </div>
          </div>
        </div>

        {/* ===== ABA: CONTATOS ===== */}
        <div className={activeTab === "contatos" ? "block space-y-3" : "hidden"}>
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-[12px]">
              Adicione os contatos responsáveis deste cliente (compradores, logística, financeiro, etc.)
            </p>
            <button
              type="button"
              onClick={adicionarContato}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-[12px] font-bold uppercase hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Contato
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="bg-[#0f172a] border border-dashed border-slate-700 p-10 text-center">
              <User className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-[13px]">Nenhum contato adicionado.</p>
              <p className="text-slate-600 text-[11px] mt-1">
                Clique em "+ Adicionar Contato" para incluir responsáveis.
              </p>
            </div>
          ) : (
            fields.map((field, index) => (
              <div
                key={field.id}
                className="bg-[#0f172a] border border-slate-700 p-4 space-y-3"
              >
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-slate-300 text-[11px] font-bold uppercase tracking-widest">
                    Contato #{index + 1}
                  </span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register(`contatos.${index}.principal`)}
                        className="accent-blue-500"
                      />
                      <span className="text-[11px] text-slate-400">Principal</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Nome</label>
                    <input
                      {...register(`contatos.${index}.nome`)}
                      type="text"
                      className={`${inputClass} uppercase`}
                      placeholder="Nome do responsável"
                    />
                    {errors.contatos?.[index]?.nome && (
                      <p className={errorClass}>{errors.contatos[index]?.nome?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>Cargo / Setor</label>
                    <input
                      {...register(`contatos.${index}.cargo`)}
                      type="text"
                      className={`${inputClass} uppercase`}
                      placeholder="Ex: Gerente de Logística"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Telefone</label>
                    <IMaskInput
                      key={`tel-${field.id}`}
                      mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]}
                      onAccept={(val) => setValue(`contatos.${index}.telefone`, val as string)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>WhatsApp</label>
                    <IMaskInput
                      key={`wa-${field.id}`}
                      mask="(00) 00000-0000"
                      onAccept={(val) => setValue(`contatos.${index}.whatsapp`, val as string)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className={labelClass}>E-mail</label>
                    <input
                      {...register(`contatos.${index}.email`)}
                      type="email"
                      className={`${inputClass} lowercase`}
                      placeholder="email@empresa.com.br"
                    />
                    {errors.contatos?.[index]?.email && (
                      <p className={errorClass}>{errors.contatos[index]?.email?.message}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
          <Link
            href="/clientes"
            className="px-6 py-2 bg-slate-800 text-white text-[13px] font-bold uppercase hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Salvando..." : "Salvar Cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

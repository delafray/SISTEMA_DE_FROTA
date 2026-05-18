"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clienteSchema, ClienteData } from "@/lib/schemas/cliente";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";

export default function NovoClientePage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClienteData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { status: "ATIVO" },
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
        // Foca automaticamente no campo de número após preencher o CEP
        document.getElementById("numero")?.focus();
      }
    }
  };

  const onSubmit = async (data: ClienteData) => {
    console.log("Salvar cliente:", data);
    await new Promise((resolve) => setTimeout(resolve, 800));
    router.push("/clientes");
    router.refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-800">
        <Link
          href="/clientes"
          className="text-slate-400 hover:text-white transition-colors"
        >
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
          Cadastrar Cliente
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Bloco: Dados Principais */}
        <div className="bg-[#0f172a] border border-slate-700 p-4 rounded-none space-y-4">
          <h2 className="text-slate-300 text-xs font-bold uppercase tracking-widest border-b border-slate-800 pb-2">
            Dados Principais
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                CNPJ / CPF
              </label>
              <IMaskInput
                mask={[{ mask: "000.000.000-00" }, { mask: "00.000.000/0000-00" }]}
                onAccept={(val) => setValue("cnpj_cpf", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.cnpj_cpf && <p className="text-red-400 text-[10px]">{errors.cnpj_cpf.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Razão Social / Nome
              </label>
              <input
                {...register("razao_social")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.razao_social && <p className="text-red-400 text-[10px]">{errors.razao_social.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Nome Fantasia
              </label>
              <input
                {...register("nome_fantasia")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Telefone
              </label>
              <IMaskInput
                mask={[{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }]}
                onAccept={(val) => setValue("telefone", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.telefone && <p className="text-red-400 text-[10px]">{errors.telefone.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                E-mail
              </label>
              <input
                {...register("email")}
                type="email"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 lowercase"
              />
              {errors.email && <p className="text-red-400 text-[10px]">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Bloco: Endereço (com busca ViaCEP) */}
        <div className="bg-[#0f172a] border border-slate-700 p-4 rounded-none space-y-4">
          <h2 className="text-slate-300 text-xs font-bold uppercase tracking-widest border-b border-slate-800 pb-2">
            Endereço
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                CEP (Busca Automática)
              </label>
              <IMaskInput
                mask="00000-000"
                onAccept={(val) => setValue("cep", val as string, { shouldValidate: true })}
                onBlur={handleCepBlur}
                className="w-full px-3 py-1.5 bg-blue-900/20 border border-blue-900/50 text-blue-200 text-[13px] rounded-none focus:outline-none focus:border-blue-500"
                placeholder="00000-000"
              />
              {errors.cep && <p className="text-red-400 text-[10px]">{errors.cep.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Logradouro / Endereço
              </label>
              <input
                {...register("endereco")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.endereco && <p className="text-red-400 text-[10px]">{errors.endereco.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Número
              </label>
              <input
                {...register("numero")}
                id="numero"
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.numero && <p className="text-red-400 text-[10px]">{errors.numero.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Complemento
              </label>
              <input
                {...register("complemento")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Bairro
              </label>
              <input
                {...register("bairro")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.bairro && <p className="text-red-400 text-[10px]">{errors.bairro.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Cidade
              </label>
              <input
                {...register("cidade")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.cidade && <p className="text-red-400 text-[10px]">{errors.cidade.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                UF
              </label>
              <input
                {...register("uf")}
                type="text"
                maxLength={2}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase text-center"
              />
              {errors.uf && <p className="text-red-400 text-[10px]">{errors.uf.message}</p>}
            </div>

          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="/clientes"
            className="px-6 py-2 bg-slate-800 text-white text-[13px] font-bold uppercase rounded-none hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Salvando..." : "Salvar Cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

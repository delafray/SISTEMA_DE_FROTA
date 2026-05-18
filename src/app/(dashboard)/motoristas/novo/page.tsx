"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motoristaSchema, MotoristaData } from "@/lib/schemas/motorista";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";

export default function NovoMotoristaPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MotoristaData>({
    resolver: zodResolver(motoristaSchema),
    defaultValues: { status: "ATIVO" },
  });

  const onSubmit = async (data: MotoristaData) => {
    console.log("Salvar motorista:", data);
    await new Promise((resolve) => setTimeout(resolve, 800));
    router.push("/motoristas");
    router.refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-800">
        <Link
          href="/motoristas"
          className="text-slate-400 hover:text-white transition-colors"
        >
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
          Cadastrar Motorista
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-[#0f172a] border border-slate-700 p-4 rounded-none">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="space-y-1 md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Nome Completo
              </label>
              <input
                {...register("nome")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.nome && <p className="text-red-400 text-[10px]">{errors.nome.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                CPF
              </label>
              <IMaskInput
                mask="000.000.000-00"
                onAccept={(val) => setValue("cpf", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.cpf && <p className="text-red-400 text-[10px]">{errors.cpf.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Telefone / Celular
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
                CNH
              </label>
              <IMaskInput
                mask="00000000000"
                onAccept={(val) => setValue("cnh", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.cnh && <p className="text-red-400 text-[10px]">{errors.cnh.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Categoria CNH
              </label>
              <input
                {...register("cnh_categoria")}
                type="text"
                maxLength={2}
                placeholder="Ex: E"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase text-center"
              />
              {errors.cnh_categoria && <p className="text-red-400 text-[10px]">{errors.cnh_categoria.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Vencimento CNH
              </label>
              <input
                {...register("cnh_vencimento")}
                type="date"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 [color-scheme:dark]"
              />
              {errors.cnh_vencimento && <p className="text-red-400 text-[10px]">{errors.cnh_vencimento.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Status
              </label>
              <select
                {...register("status")}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              >
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
              {errors.status && <p className="text-red-400 text-[10px]">{errors.status.message}</p>}
            </div>

          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="/motoristas"
            className="px-6 py-2 bg-slate-800 text-white text-[13px] font-bold uppercase rounded-none hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Salvando..." : "Salvar Motorista"}
          </button>
        </div>
      </form>
    </div>
  );
}

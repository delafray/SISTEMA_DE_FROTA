"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { veiculoSchema, VeiculoData } from "@/lib/schemas/veiculo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";

export default function NovoVeiculoPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VeiculoData>({
    resolver: zodResolver(veiculoSchema),
    defaultValues: { status: "ATIVO" },
  });

  const onSubmit = async (data: VeiculoData) => {
    // Busca a empresa_id do usuário logado antes de salvar
    const { data: userAuth } = await supabase.auth.getUser();
    if (!userAuth.user) return;

    // TODO: A lógica real precisa pegar a empresa_id do usuário.
    // Usaremos um valor placeholder ou buscaremos do banco.
    // Vamos apenas imprimir no log para a "outra IA" cuidar da gravação exata depois,
    // ou gravar direto se já soubermos.
    console.log("Salvar veículo:", data);
    
    // Simula salvamento
    await new Promise((resolve) => setTimeout(resolve, 800));
    router.push("/veiculos");
    router.refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-800">
        <Link
          href="/veiculos"
          className="text-slate-400 hover:text-white transition-colors"
        >
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
          Cadastrar Veículo
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-[#0f172a] border border-slate-700 p-4 rounded-none">
          {/* Grid denso */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Placa
              </label>
              <IMaskInput
                mask="aaa-0*00"
                definitions={{
                  '*': /[a-zA-Z0-9]/
                }}
                prepare={(str) => str.toUpperCase()}
                onAccept={(val) => setValue("placa", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
                placeholder="ABC-1D23"
              />
              {errors.placa && <p className="text-red-400 text-[10px]">{errors.placa.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Renavam
              </label>
              <input
                {...register("renavam")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.renavam && <p className="text-red-400 text-[10px]">{errors.renavam.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Marca
              </label>
              <input
                {...register("marca")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.marca && <p className="text-red-400 text-[10px]">{errors.marca.message}</p>}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Modelo
              </label>
              <input
                {...register("modelo")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.modelo && <p className="text-red-400 text-[10px]">{errors.modelo.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Ano
              </label>
              <IMaskInput
                mask="0000"
                onAccept={(val) => setValue("ano", val as string, { shouldValidate: true })}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.ano && <p className="text-red-400 text-[10px]">{errors.ano.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Cor
              </label>
              <input
                {...register("cor")}
                type="text"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              />
              {errors.cor && <p className="text-red-400 text-[10px]">{errors.cor.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Capacidade (KG)
              </label>
              <input
                {...register("capacidade_kg", { valueAsNumber: true })}
                type="number"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500"
              />
              {errors.capacidade_kg && <p className="text-red-400 text-[10px]">{errors.capacidade_kg.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Status
              </label>
              <select
                {...register("status")}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 text-white text-[13px] rounded-none focus:outline-none focus:border-blue-500 uppercase"
              >
                <option value="ATIVO">ATIVO</option>
                <option value="MANUTENCAO">MANUTENÇÃO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
              {errors.status && <p className="text-red-400 text-[10px]">{errors.status.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="/veiculos"
            className="px-6 py-2 bg-slate-800 text-white text-[13px] font-bold uppercase rounded-none hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Salvando..." : "Salvar Veículo"}
          </button>
        </div>
      </form>
    </div>
  );
}

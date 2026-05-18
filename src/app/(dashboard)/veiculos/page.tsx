import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function VeiculosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Busca os veículos (simplificado para demonstração)
  const { data: veiculos } = await supabase
    .from("veiculos")
    .select("*")
    .order("placa");

  const columns = [
    { key: "placa", label: "Placa" },
    { key: "marca", label: "Marca" },
    { key: "modelo", label: "Modelo" },
    { key: "ano", label: "Ano" },
    {
      key: "capacidade_kg",
      label: "Capacidade (KG)",
      render: (row: any) => row.capacidade_kg?.toLocaleString() || "-",
    },
    {
      key: "status",
      label: "Status",
      render: (row: any) => (
        <span
          className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase border
            ${
              row.status === "ATIVO"
                ? "bg-emerald-900/30 text-emerald-400 border-emerald-800"
                : row.status === "MANUTENCAO"
                ? "bg-amber-900/30 text-amber-400 border-amber-800"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }
          `}
        >
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
            Veículos
          </h1>
          <p className="text-slate-400 text-sm">Gerencie a frota de caminhões</p>
        </div>
      </div>

      <DataTable
        data={veiculos || []}
        columns={columns}
        searchPlaceholder="Buscar por placa ou modelo..."
        primaryAction={
          <Link
            href="/veiculos/novo"
            className="px-4 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors inline-block"
          >
            + Cadastrar Veículo
          </Link>
        }
      />
    </div>
  );
}

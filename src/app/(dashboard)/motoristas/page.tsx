import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MotoristasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Busca os motoristas
  const { data: motoristas } = await supabase
    .from("motoristas")
    .select("*")
    .order("nome");

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF" },
    { key: "cnh", label: "CNH" },
    { key: "cnh_categoria", label: "Cat. CNH" },
    {
      key: "cnh_vencimento",
      label: "Vencimento CNH",
      render: (row: any) => {
        if (!row.cnh_vencimento) return "-";
        // Formata data YYYY-MM-DD para DD/MM/YYYY
        const [y, m, d] = row.cnh_vencimento.split("-");
        return `${d}/${m}/${y}`;
      },
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
            Motoristas
          </h1>
          <p className="text-slate-400 text-sm">Gerencie os motoristas da frota</p>
        </div>
      </div>

      <DataTable
        data={motoristas || []}
        columns={columns}
        searchPlaceholder="Buscar por nome ou CPF..."
        primaryAction={
          <Link
            href="/motoristas/novo"
            className="px-4 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors inline-block"
          >
            + Cadastrar Motorista
          </Link>
        }
      />
    </div>
  );
}

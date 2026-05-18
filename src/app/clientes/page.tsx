import { createClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ClientesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Busca os clientes
  const { data: clientes } = await supabase
    .from("clientes")
    .select("*")
    .order("nome_fantasia");

  const columns = [
    { key: "nome_fantasia", label: "Nome Fantasia" },
    { key: "razao_social", label: "Razão Social" },
    { key: "documento", label: "CNPJ/CPF" },
    { key: "cidade", label: "Cidade" },
    { key: "uf", label: "UF" },
    {
      key: "ativo",
      label: "Status",
      render: (row: any) => (
        <span
          className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase border
            ${
              row.ativo !== false
                ? "bg-emerald-900/30 text-emerald-400 border-emerald-800"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }
          `}
        >
          {row.ativo !== false ? "ATIVO" : "INATIVO"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
            Clientes
          </h1>
          <p className="text-slate-400 text-sm">Gerencie seus clientes e embarcadores</p>
        </div>
      </div>

      <DataTable
        data={clientes || []}
        columns={columns}
        searchPlaceholder="Buscar por nome ou documento..."
        primaryAction={
          <Link
            href="/clientes/novo"
            className="px-4 py-2 bg-blue-600 text-white text-[13px] font-bold uppercase rounded-none hover:bg-blue-700 transition-colors inline-block"
          >
            + Cadastrar Cliente
          </Link>
        }
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Painel de Controle</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#1e293b] p-6 border border-slate-700">
          <h3 className="text-slate-400 text-sm font-medium mb-2">Total de Fretes</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="bg-[#1e293b] p-6 border border-slate-700">
          <h3 className="text-slate-400 text-sm font-medium mb-2">Veículos Ativos</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="bg-[#1e293b] p-6 border border-slate-700">
          <h3 className="text-slate-400 text-sm font-medium mb-2">Lucro do Mês</h3>
          <p className="text-3xl font-bold text-green-400">R$ 0,00</p>
        </div>
      </div>
    </>
  );
}

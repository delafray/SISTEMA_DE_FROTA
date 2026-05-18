import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex">
      {/* Sidebar Placeholder */}
      <aside className="w-56 bg-[#313f50] flex flex-col p-4 border-r border-slate-700">
        <h2 className="text-xl font-bold mb-8 text-blue-400">FROTA</h2>
        <nav className="space-y-2">
          <a href="#" className="block p-2 bg-blue-600 rounded-none">Início</a>
          <a href="#" className="block p-2 hover:bg-[#1e293b] rounded-none">Fretes</a>
          <a href="#" className="block p-2 hover:bg-[#1e293b] rounded-none">Veículos</a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
          <h1 className="text-2xl font-bold">Painel de Controle</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{user.email}</span>
            <form action={async () => {
              'use server';
              const supabase = await createClient();
              await supabase.auth.signOut();
              redirect('/login');
            }}>
              <button className="text-sm text-red-400 hover:text-red-300">Sair</button>
            </form>
          </div>
        </header>

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
      </main>
    </div>
  )
}

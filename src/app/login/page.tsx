import { login } from './actions'
import { Truck } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
      <div className="w-full max-w-md bg-[#1e293b] p-8 border border-slate-700 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-[#313f50] mb-4">
            <Truck className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Sistema de Frota</h1>
          <p className="text-slate-400 text-sm mt-2">Acesse sua conta para continuar</p>
        </div>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-600 text-white focus:outline-none focus:border-blue-500 rounded-none transition-colors"
              placeholder="Digite seu usuário"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-600 text-white focus:outline-none focus:border-blue-500 rounded-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            formAction={login}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none transition-colors uppercase tracking-wider text-sm mt-4"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}

"use client";

import { login } from './actions'
import { inputStyle } from "@/components/ui/ds";
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { createClient } from '@/lib/supabase/client'

// Botão separado por causa do useFormStatus (precisa estar DENTRO do <form>).
// Sem o "Entrando...", em rede móvel o gestor clicava 3x achando que travou.
function BotaoEntrar() {
  const { pending } = useFormStatus()
  return (
    <button
      formAction={login}
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px",
        minHeight: "48px",
        background: pending ? "#93c5fd" : "#2563eb",
        color: "#fff",
        fontWeight: 600,
        fontSize: "14px",
        borderRadius: "8px",
        border: "none",
        cursor: pending ? "wait" : "pointer",
        marginTop: "8px",
        transition: "background 150ms"
      }}
      onMouseEnter={(e) => { if (!pending) e.currentTarget.style.background = "#1d4ed8" }}
      onMouseLeave={(e) => { if (!pending) e.currentTarget.style.background = "#2563eb" }}
    >
      {pending ? "ENTRANDO..." : "ENTRAR"}
    </button>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get('error')

  // Guarda reversa: se uma entrada /login sobrou no histórico (chute indevido
  // de guard ou o próprio pós-login), o botão voltar do celular caía aqui MESMO
  // LOGADO. Com sessão válida, devolve pro painel sem poluir o histórico.
  useEffect(() => {
    if (error) return // veio de uma falha de login — deixa o formulário aparecer
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [error, router])

  return (
    <div style={{
      width: "100%",
      maxWidth: "400px",
      background: "#ffffff",
      padding: "40px 32px",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
      border: "1px solid #e2e8f0"
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1e293b", letterSpacing: "-0.02em", margin: 0 }}>
          SISTEMA DE FROTA
        </h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>
          Acesse sua conta para continuar
        </p>
      </div>

      {error && (
        <div style={{
          padding: "12px 16px",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "8px",
          color: "#991b1b",
          fontSize: "13px",
          fontWeight: 500,
          marginBottom: "20px",
          textAlign: "center"
        }}>
          ⚠ Usuário ou senha incorretos. Verifique e tente novamente.
        </div>
      )}

      <form style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }} htmlFor="username">
            Usuário / E-mail
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            style={{ ...inputStyle, padding: "12px 16px" }}
            placeholder="Digite seu usuário"
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }} htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            style={{ ...inputStyle, padding: "12px 16px" }}
            placeholder="••••••••"
          />
        </div>

        <BotaoEntrar />
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f8fafc",
      padding: "16px"
    }}>
      <Suspense fallback={
        <div style={{ color: "#64748b", fontSize: "14px" }}>
          Carregando formulário de acesso...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}

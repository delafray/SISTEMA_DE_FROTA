"use client";

import { login } from './actions'
import { inputStyle, Btn } from "@/components/ui/ds";

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

          <button
            formAction={login}
            style={{
              width: "100%",
              padding: "12px",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: "14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              marginTop: "8px",
              transition: "background 150ms"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#1d4ed8"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#2563eb"}
          >
            ENTRAR
          </button>
        </form>
      </div>
    </div>
  )
}

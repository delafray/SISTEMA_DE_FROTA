"use client";

import { useActionState, useEffect, useState } from "react";
import { salvarCadastroApiAction, type SalvarCadastroState } from "./actions";

interface Props {
  apiId: string;
  /** Serviço público sem conta → mostra "não precisou de cadastro". */
  semCadastro?: boolean;
  email: string | null;
  cartaoFinal: string | null;
  observacao: string | null;
}

const INICIAL: SalvarCadastroState = {};

/**
 * Bloco de cadastro de conta por serviço (email + final do cartão), na página
 * /uso-apis. Server action re-valida o papel admin/master. Serviços públicos
 * (Nominatim/ViaCEP) mostram apenas "não precisou de cadastro".
 */
export function CadastroApiEditor({ apiId, semCadastro, email, cartaoFinal, observacao }: Props) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(salvarCadastroApiAction, INICIAL);

  // Fecha o formulário quando salva com sucesso (revalidatePath atualiza os dados
  // exibidos). Sincroniza a UI com o resultado da server action — caso legítimo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.sucesso) setAberto(false);
  }, [state.sucesso]);

  if (semCadastro) {
    return (
      <div
        data-testid={`sem-cadastro-${apiId}`}
        style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}
      >
        ✅ Não precisou de cadastro (serviço público, acesso direto)
      </div>
    );
  }

  const temDados = !!(email || cartaoFinal || observacao);

  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed #e2e8f0", paddingTop: 8 }}>
      {/* Resumo do cadastro atual */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {email ? (
            <>📧 <strong>{email}</strong></>
          ) : (
            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>sem email cadastrado</span>
          )}
          {cartaoFinal && <> · 💳 final <strong>{cartaoFinal}</strong></>}
        </span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          data-testid={`editar-${apiId}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#2563eb",
            background: "transparent",
            border: "1px solid #bfdbfe",
            borderRadius: 6,
            padding: "8px 12px",
            minHeight: 36,
            cursor: "pointer",
          }}
        >
          {temDados ? "✏️ Editar" : "+ Cadastrar"}
        </button>
      </div>

      {observacao && (
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>📝 {observacao}</div>
      )}

      {/* Formulário inline */}
      {aberto && (
        <form action={formAction} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="hidden" name="apiId" value={apiId} />
          <label style={labelStyle}>
            Email da conta
            <input
              name="email"
              type="email"
              defaultValue={email ?? ""}
              placeholder="qual email abriu a conta?"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Final do cartão (4 dígitos)
            <input
              name="cartaoFinal"
              type="text"
              inputMode="numeric"
              maxLength={4}
              defaultValue={cartaoFinal ?? ""}
              placeholder="1234"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Observação (opcional)
            <input
              name="observacao"
              type="text"
              defaultValue={observacao ?? ""}
              placeholder="ex: cartão da empresa, conta do João…"
              style={inputStyle}
            />
          </label>

          {state.erro && (
            <div role="alert" style={{ fontSize: 12, color: "#b91c1c" }}>{state.erro}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={pending} style={btnSalvar(pending)}>
              {pending ? "Salvando…" : "💾 Salvar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} style={btnCancelar}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontWeight: 400,
};

function btnSalvar(pending: boolean): React.CSSProperties {
  return {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: pending ? "not-allowed" : "pointer",
    opacity: pending ? 0.6 : 1,
  };
}

const btnCancelar: React.CSSProperties = {
  background: "transparent",
  color: "#64748b",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

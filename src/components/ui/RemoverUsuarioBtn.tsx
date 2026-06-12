"use client";

import { useState } from "react";
import { removerUsuarioAction } from "@/app/(dashboard)/usuarios/novo/actions";

export function RemoverUsuarioBtn({ usuarioId, empresaId }: { usuarioId: string; empresaId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const handleRemover = async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await removerUsuarioAction(usuarioId, empresaId);
      if (res?.error) {
        setErro(`Não foi possível remover: ${res.error}`);
        return;
      }
      // Recarrega de verdade: o estado da listagem é client-side e o refresh do
      // router sozinho não atualiza a lista local.
      window.location.reload();
    } catch {
      setErro("Falha de conexão ao remover. Verifique a internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setConfirmando(true); }}
        className="m-touch"
        style={{
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "6px",
          color: "#ef4444", cursor: "pointer",
          fontSize: "inherit", padding: "4px 10px", fontWeight: 600,
        }}
      >
        Remover
      </button>

      {confirmando && (
        <div
          onClick={(e) => { e.stopPropagation(); if (!loading) setConfirmando(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px", cursor: "default",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "14px", width: "100%", maxWidth: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "20px",
              display: "flex", flexDirection: "column", gap: "12px", textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#991b1b" }}>
              🚫 Remover usuário da empresa
            </div>
            <div style={{ fontSize: "13px", color: "#475569" }}>
              O acesso desta pessoa ao sistema será revogado. Tem certeza?
            </div>
            {erro && (
              <div role="alert" style={{
                padding: "10px 12px", background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: "8px", color: "#991b1b", fontSize: "13px", fontWeight: 600,
              }}>
                ⚠️ {erro}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                onClick={() => setConfirmando(false)}
                disabled={loading}
                style={{
                  padding: "10px 16px", minHeight: "44px", background: "none",
                  border: "1px solid #e2e8f0", borderRadius: "8px",
                  fontSize: "12px", fontWeight: 600, color: "#64748b", cursor: "pointer",
                }}
              >
                ← Voltar
              </button>
              <button
                onClick={handleRemover}
                disabled={loading}
                style={{
                  padding: "10px 16px", minHeight: "44px",
                  background: loading ? "#fca5a5" : "#ef4444", color: "#fff",
                  border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "Removendo..." : "Sim, remover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

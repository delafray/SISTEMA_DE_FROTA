"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

// só tabelas que têm coluna `id` (DeleteBtn deleta por id)
type TableName = {
  [K in keyof Database["public"]["Tables"]]: "id" extends keyof Database["public"]["Tables"][K]["Row"] ? K : never;
}[keyof Database["public"]["Tables"]];

export function DeleteBtn({ id, table, label = "registro" }: {
  id: string;
  table: TableName;
  label?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    setErro("");
    try {
      const supabase = createClient();
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        setErro(`Não foi possível excluir: ${error.message}`);
        return;
      }
      setConfirmando(false);
      router.refresh();
    } catch {
      setErro("Falha de conexão ao excluir. Verifique a internet e tente de novo.");
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
          background: "none",
          border: "none",
          color: "#ef4444",
          cursor: "pointer",
          fontSize: "inherit",
          padding: "4px 6px",
          fontWeight: 600,
        }}
      >
        Excluir
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
              🗑️ Excluir {label}
            </div>
            <div style={{ fontSize: "13px", color: "#475569" }}>
              Esta ação não pode ser desfeita. Tem certeza?
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
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: "10px 16px", minHeight: "44px",
                  background: loading ? "#fca5a5" : "#ef4444", color: "#fff",
                  border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

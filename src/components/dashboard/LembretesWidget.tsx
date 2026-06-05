"use client";

import { useState, useEffect, useCallback } from "react";

type Lembrete = {
  id: string;
  texto: string;
  origem: string;
  criado_em: string;
  ciente_em: string | null;
  criado_por_nome: string | null;
  perfis: { nome: string } | { nome: string }[] | null;
};

function fmtDataHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function nomePerfil(l: Pick<Lembrete, "criado_por_nome" | "perfis">) {
  if (l.criado_por_nome) return l.criado_por_nome;
  const p = Array.isArray(l.perfis) ? l.perfis[0] : l.perfis;
  return p?.nome ?? "—";
}

// ─── Modal Histórico ─────────────────────────────────────────────────
function HistoricoModal({ onClose }: { onClose: () => void }) {
  const [todos, setTodos]         = useState<Lembrete[]>([]);
  const [loading, setLoading]     = useState(true);
  const [ciendoId, setCiendoId]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lembretes?historico=true', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setTodos(d.lembretes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const darCiente = async (id: string) => {
    setCiendoId(id);
    await fetch(`/api/lembretes/${id}/ciente`, { method: 'PATCH' });
    setTodos(prev => prev.map(l =>
      l.id === id ? { ...l, ciente_em: new Date().toISOString() } : l
    ));
    setCiendoId(null);
  };

  const pendentes  = todos.filter(l => !l.ciente_em);
  const concluidos = todos.filter(l =>  l.ciente_em);

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "14px", width: "100%", maxWidth: 560,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>
            📋 Histórico de Lembretes
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#94a3b8", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Carregando...</div>
          )}

          {!loading && todos.length === 0 && (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px", fontSize: "13px" }}>
              Nenhum lembrete registrado ainda.
            </div>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                📌 Pendentes ({pendentes.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {pendentes.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "flex-start", gap: "10px",
                    padding: "10px 12px", background: "#fffbeb",
                    border: "1px solid #fde68a", borderRadius: "8px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", wordBreak: "break-word" }}>
                        {l.texto}
                      </div>
                      <div style={{ fontSize: "11px", color: "#92400e", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span>👤 {nomePerfil(l)}</span>
                        <span>{fmtDataHora(l.criado_em)}</span>
                        <span style={{ opacity: 0.7 }}>{l.origem === "whatsapp" ? "via WhatsApp" : "via painel"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => darCiente(l.id)}
                      disabled={ciendoId === l.id}
                      style={{
                        flexShrink: 0, padding: "5px 10px",
                        background: ciendoId === l.id ? "#d1d5db" : "#16a34a",
                        color: "#fff", border: "none", borderRadius: "6px",
                        fontSize: "11px", fontWeight: 600,
                        cursor: ciendoId === l.id ? "default" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ciendoId === l.id ? "..." : "✅ Ciente"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concluídos */}
          {concluidos.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                ✅ Ciente ({concluidos.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {concluidos.map(l => (
                  <div key={l.id} style={{
                    padding: "10px 12px", background: "#f8fafc",
                    border: "1px solid #e2e8f0", borderRadius: "8px",
                    opacity: 0.75,
                  }}>
                    <div style={{ fontSize: "13px", color: "#475569", wordBreak: "break-word" }}>
                      {l.texto}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span>👤 {nomePerfil(l)}</span>
                      <span>{fmtDataHora(l.criado_em)}</span>
                      {l.ciente_em && <span>✅ Ciente em {fmtDataHora(l.ciente_em)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Widget principal ────────────────────────────────────────────────
export function LembretesWidget() {
  const [lembretes, setLembretes]   = useState<Lembrete[]>([]);
  const [ciendoId, setCiendoId]     = useState<string | null>(null);
  const [modalAberto, setModal]     = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/lembretes', { cache: 'no-store' });
      const { lembretes: data } = await res.json();
      setLembretes(data ?? []);
    } catch { /* ignora */ }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const darCiente = async (id: string) => {
    setCiendoId(id);
    await fetch(`/api/lembretes/${id}/ciente`, { method: 'PATCH' });
    setLembretes(prev => prev.filter(l => l.id !== id));
    setCiendoId(null);
  };

  return (
    <>
      {/* Widget só aparece se houver pendentes OU sempre (para mostrar o botão Histórico) */}
      {lembretes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {/* Cabeçalho com botão Histórico */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              📌 Lembretes pendentes ({lembretes.length})
            </div>
            <button
              onClick={() => setModal(true)}
              style={{
                background: "none", border: "1px solid #fde68a", borderRadius: "6px",
                padding: "3px 10px", fontSize: "11px", fontWeight: 600,
                color: "#92400e", cursor: "pointer",
              }}
            >
              📋 Histórico
            </button>
          </div>

          {lembretes.map(l => (
            <div key={l.id} style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "12px 14px", background: "#fffbeb",
              border: "1px solid #fde68a", borderRadius: "8px",
            }}>
              <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0, marginTop: "1px" }}>📌</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b", lineHeight: "1.4", wordBreak: "break-word" }}>
                  {l.texto}
                </div>
                <div style={{ fontSize: "11px", color: "#92400e", marginTop: "4px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span>👤 {nomePerfil(l)}</span>
                  <span>{fmtDataHora(l.criado_em)}</span>
                  <span style={{ opacity: 0.7 }}>{l.origem === "whatsapp" ? "via WhatsApp" : "via painel"}</span>
                </div>
              </div>
              <button
                onClick={() => darCiente(l.id)}
                disabled={ciendoId === l.id}
                style={{
                  flexShrink: 0, padding: "6px 12px",
                  background: ciendoId === l.id ? "#d1d5db" : "#16a34a",
                  color: "#fff", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: 600,
                  cursor: ciendoId === l.id ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {ciendoId === l.id ? "..." : "✅ Ciente"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        // Sem pendentes: mostra só o botão Histórico discreto
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setModal(true)}
            style={{
              background: "none", border: "1px solid #e2e8f0", borderRadius: "6px",
              padding: "4px 12px", fontSize: "11px", fontWeight: 600,
              color: "#94a3b8", cursor: "pointer",
            }}
          >
            📋 Histórico de lembretes
          </button>
        </div>
      )}

      {modalAberto && <HistoricoModal onClose={() => { setModal(false); carregar(); }} />}
    </>
  );
}

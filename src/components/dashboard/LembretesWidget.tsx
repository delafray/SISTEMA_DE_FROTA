"use client";

import { useState, useEffect, useCallback } from "react";

type Lembrete = {
  id: string;
  texto: string;
  origem: string;
  criado_em: string;
  perfis: { nome: string } | { nome: string }[] | null;
};

export function LembretesWidget() {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [ciendoId, setCiendoId]   = useState<string | null>(null);

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

  if (lembretes.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
        📌 Lembretes pendentes ({lembretes.length})
      </div>

      {lembretes.map(l => {
        const perfil = Array.isArray(l.perfis) ? l.perfis[0] : l.perfis;
        const nome = perfil?.nome ?? "—";
        const data = new Date(l.criado_em);
        const dataStr = data.toLocaleDateString("pt-BR");
        const horaStr = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

        return (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 14px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "8px",
            }}
          >
            <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0, marginTop: "1px" }}>📌</span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b", lineHeight: "1.4", wordBreak: "break-word" }}>
                {l.texto}
              </div>
              <div style={{ fontSize: "11px", color: "#92400e", marginTop: "4px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span>👤 {nome}</span>
                <span>📅 {dataStr} às {horaStr}</span>
                <span style={{ opacity: 0.7 }}>{l.origem === "whatsapp" ? "via WhatsApp" : "via painel"}</span>
              </div>
            </div>

            <button
              onClick={() => darCiente(l.id)}
              disabled={ciendoId === l.id}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                background: ciendoId === l.id ? "#d1d5db" : "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: ciendoId === l.id ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {ciendoId === l.id ? "..." : "✅ Ciente"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

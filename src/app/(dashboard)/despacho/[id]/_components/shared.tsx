"use client";

/**
 * Primitivos visuais compartilhados entre as abas do detalhe do despacho.
 * Row e Bloco são padrão desta tela (pontilhado + borda colorida por seção).
 */

import React from "react";

/** Linha "rótulo ····· valor" — pontilhado liga o campo ao valor (pedido do dono). */
export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", padding: "9px 0" }}>
      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: "2px dotted #cbd5e1", transform: "translateY(-3px)" }} />
      <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/** Bloco com borda forte e cabeçalho colorido — separa visualmente Pedido / Despacho / etc. */
export function Bloco({
  titulo, cor, acoes, children,
}: {
  titulo: string;
  cor: { borda: string; fundo: string; texto: string };
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: "#fff", border: `2px solid ${cor.borda}`, borderRadius: "12px", overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
        background: cor.fundo, borderBottom: `2px solid ${cor.borda}`,
        padding: "10px 16px",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 800, color: cor.texto, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {titulo}
        </span>
        {acoes}
      </div>
      <div style={{ padding: "10px 16px 14px" }}>{children}</div>
    </section>
  );
}

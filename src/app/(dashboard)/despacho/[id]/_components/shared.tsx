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

/** Linha com vários campos lado a lado (dono 11/06: valor PERTO da legenda,
 *  agrupado — ex.: Cliente · Nº · Entregas numa linha; datas na linha de baixo).
 *  GRID com `cols` fixas: linhas com o mesmo `cols` ficam com as bordas dos
 *  cartões perfeitamente alinhadas entre si (dono 11/06: Nº × Fim Previsto). */
export function LinhaCampos({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: "8px", marginBottom: "8px",
    }}>
      {children}
    </div>
  );
}

/** Campo compacto: rótulo em cima, valor logo abaixo. Usar dentro de LinhaCampos.
 *  `span` = quantas colunas da grid o campo ocupa. */
export function Campo({ label, value, span = 1 }: { label: string; value: React.ReactNode; span?: number }) {
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
      padding: "8px 12px",
    }}>
      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "13px", color: "#1e293b", fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
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

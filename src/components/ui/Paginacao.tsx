"use client";

/**
 * Controles de paginação (desktop/mobile) — extraído de pedidos/ e despacho/
 * para componente de módulo: criar componente DENTRO do componente da página
 * remonta a subárvore a cada render (regra react-hooks "static-components").
 */

import { Btn } from "@/components/ui/ds";

export function Paginacao({
  mobile = false, pagina, totalPaginas, total, loading, onPagina, rotulo = "pedidos",
}: {
  mobile?: boolean;
  pagina: number;
  totalPaginas: number;
  total: number;
  loading: boolean;
  onPagina: (pagina: number) => void;
  rotulo?: string;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      justifyContent: mobile ? "center" : "flex-end",
      padding: "8px 0",
    }}>
      {!mobile && (
        <span style={{ fontSize: "13px", color: "#64748b" }}>
          Página {pagina + 1} de {totalPaginas} · {total} {rotulo}
        </span>
      )}
      <Btn
        variant="outline" size={mobile ? "sm" : "xs"}
        disabled={pagina === 0 || loading}
        onClick={() => onPagina(Math.max(0, pagina - 1))}
      >
        ← Anterior
      </Btn>
      {mobile && (
        <span style={{ fontSize: "13px", color: "#64748b" }}>{pagina + 1}/{totalPaginas}</span>
      )}
      <Btn
        variant="outline" size={mobile ? "sm" : "xs"}
        disabled={pagina >= totalPaginas - 1 || loading}
        onClick={() => onPagina(pagina + 1)}
      >
        Próxima →
      </Btn>
    </div>
  );
}

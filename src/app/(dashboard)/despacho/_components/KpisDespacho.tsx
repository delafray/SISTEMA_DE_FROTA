"use client";

/**
 * Bloco dos 4 KPIs informativos do Despacho.
 * Extraído de despacho/page.tsx — sem mudança de comportamento ou visual.
 * Contagens vêm via props (calculadas no hook useDespacho).
 */

import { KpiCard } from "@/components/ui/ds";

type Props = {
  loading: boolean;
  totalNaLista: number;
  contFila: number | null;
  contDespachados: number | null;
  contEmRota: number | null;
};

export function KpisDespacho({
  loading,
  totalNaLista,
  contFila,
  contDespachados,
  contEmRota,
}: Props) {
  return (
    /* Mesmo padrão da listagem de Pedidos (informativos, não filtram) */
    <div
      className="m-kpi-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}
    >
      <KpiCard label="Na lista"    value={loading ? "..." : totalNaLista} />
      <KpiCard label="Na fila"     value={contFila ?? "..."}        color="warning" />
      <KpiCard label="Despachados" value={contDespachados ?? "..."} color="info" />
      <KpiCard label="Em rota"     value={contEmRota ?? "..."}      color="success" />
    </div>
  );
}

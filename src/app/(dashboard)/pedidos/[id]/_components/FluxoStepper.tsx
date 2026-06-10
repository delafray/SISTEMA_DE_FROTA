"use client";

/**
 * Stepper do fluxo do pedido (decisão do dono, 10/06/2026 — fluxo VISÍVEL,
 * padrão Fleetbase/Onfleet): Lançado → Despachado → Em rota → Concluído → Pago,
 * com o estágio atual aceso e o botão da PRÓXIMA ação ali do lado.
 */

import { Btn } from "@/components/ui/ds";

export type EtapaFluxo = {
  /** rótulo do estágio */
  label: string;
  /** estágio já concluído */
  done: boolean;
};

export function FluxoStepper({
  etapas,
  cancelado,
  acao,
}: {
  etapas: EtapaFluxo[];
  cancelado?: boolean;
  /** próxima ação do estágio atual (escondida quando o fluxo terminou/cancelou) */
  acao?: { label: string; onClick: () => void; disabled?: boolean } | null;
}) {
  const atualIdx = etapas.findIndex(e => !e.done); // -1 = tudo concluído

  return (
    <div style={{
      background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
      padding: "14px 20px", display: "flex", alignItems: "center", gap: "16px",
      flexWrap: "wrap",
      opacity: cancelado ? 0.55 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: "320px" }}>
        {etapas.map((e, i) => {
          const atual = !cancelado && i === atualIdx;
          const done = e.done;
          return (
            <div key={e.label} style={{ display: "flex", alignItems: "center", flex: i < etapas.length - 1 ? 1 : "0 0 auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: "56px" }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 700,
                  background: done ? "#16a34a" : atual ? "#2563eb" : "#f1f5f9",
                  color: done || atual ? "#fff" : "#94a3b8",
                  border: atual ? "3px solid #bfdbfe" : "none",
                  boxSizing: "content-box",
                }}>
                  {done ? "✓" : i + 1}
                </div>
                <span style={{
                  fontSize: "10px", fontWeight: atual ? 700 : 500, whiteSpace: "nowrap",
                  color: done ? "#16a34a" : atual ? "#2563eb" : "#94a3b8",
                }}>
                  {e.label}
                </span>
              </div>
              {i < etapas.length - 1 && (
                <div style={{
                  flex: 1, height: "2px", margin: "0 4px 16px",
                  background: done ? "#16a34a" : "#e2e8f0",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {cancelado ? (
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>✕ Pedido cancelado</span>
      ) : atualIdx === -1 ? (
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#16a34a" }}>🎉 Fluxo concluído</span>
      ) : acao ? (
        <Btn variant="primary" size="sm" disabled={acao.disabled} onClick={acao.onClick}>
          {acao.label}
        </Btn>
      ) : null}
    </div>
  );
}

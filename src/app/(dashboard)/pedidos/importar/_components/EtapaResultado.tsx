"use client";

// ─── Etapa 4: Tela de confirmação após importação bem-sucedida ────────────────

import { Btn } from "@/components/ui/ds";
import { idCurto } from "./tipos";

type FalhaUnificada = { origem: string; motivo: string };

type Props = {
  resultado: { entregas: number; pedidoId: string };
  todasFalhas: FalhaUnificada[];
};

export function EtapaResultado({ resultado, todasFalhas }: Props) {
  return (
    <div style={{ background: "#fff", borderRadius: "16px", padding: "40px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", textAlign: "center" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#166534", margin: "0 0 8px" }}>
        Importação concluída!
      </h2>
      <p style={{ fontSize: "15px", color: "#475569", margin: "0 0 24px" }}>
        <strong>{resultado.entregas}</strong> entrega{resultado.entregas !== 1 ? "s" : ""} anexada{resultado.entregas !== 1 ? "s" : ""} ao pedido{" "}
        <strong>#{idCurto(resultado.pedidoId)}</strong>.
      </p>

      {todasFalhas.length > 0 && (
        <div style={{
          margin: "0 auto 24px", maxWidth: "500px",
          padding: "12px 16px", background: "#fefce8",
          border: "1px solid #fde68a", borderRadius: "8px",
          textAlign: "left", fontSize: "13px", color: "#854d0e",
        }}>
          <strong>{todasFalhas.length}</strong> nota(s)/linha(s) não foram importadas por falha no parse (ver detalhes acima).
        </div>
      )}

      <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "28px" }}>
        O geocoding das entregas está sendo processado em segundo plano.
      </p>

      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        <Btn href={`/pedidos/${resultado.pedidoId}`} variant="outline">Ver pedido</Btn>
        <Btn href="/despacho" variant="primary">Voltar ao Despacho</Btn>
      </div>
    </div>
  );
}

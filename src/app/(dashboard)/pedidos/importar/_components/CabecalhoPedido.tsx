"use client";

// ─── Faixa azul com resumo do pedido alvo ────────────────────────────────────

import { rotuloPedido } from "@/lib/utils/numeroPedido";
import { Badge } from "@/components/ui/ds";
import type { PedidoAlvo } from "./tipos";

type Props = {
  pedido: PedidoAlvo;
};

export function CabecalhoPedido({ pedido }: Props) {
  const nEnt = Array.isArray(pedido.entregas) ? pedido.entregas.length : 0;

  return (
    <div style={{
      background: "#eff6ff", borderRadius: "12px", padding: "16px 20px",
      border: "1px solid #bfdbfe", display: "flex", alignItems: "center",
      justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
    }}>
      <div>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8" }}>
          Importando para o pedido {rotuloPedido(pedido.numero, pedido.id)}
        </span>
        {pedido.data_inicio_prevista && (
          <span style={{ fontSize: "12px", color: "#3b82f6", marginLeft: "12px" }}>
            {new Date(pedido.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR")}
          </span>
        )}
        {pedido.motoristas?.nome && (
          <span style={{ fontSize: "12px", color: "#475569", marginLeft: "12px" }}>
            Motorista: {pedido.motoristas.nome}
          </span>
        )}
      </div>
      <Badge variant="info">{nEnt} entrega{nEnt !== 1 ? "s" : ""} atual{nEnt !== 1 ? "is" : ""}</Badge>
    </div>
  );
}

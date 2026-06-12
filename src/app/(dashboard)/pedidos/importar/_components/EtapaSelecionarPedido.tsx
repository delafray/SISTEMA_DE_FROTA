"use client";

// ─── Etapa 1: Seletor de pedido de destino ───────────────────────────────────

import { useState } from "react";
import { Alert, Btn, FormField, selectStyle } from "@/components/ui/ds";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
import type { PedidoOpcao } from "./tipos";

type Props = {
  carregandoOpcoes: boolean;
  opcoesPedido: PedidoOpcao[];
  pedidoSelecionadoId: string;
  onChangePedido: (id: string) => void;
  onConfirmar: () => void;
};

/** Monta o rótulo exibido no select para cada pedido */
function labelPedido(p: PedidoOpcao): string {
  const nEnt = p.entregas.length;
  const primeiraEnt = p.entregas[0];
  const clienteOuDestino =
    primeiraEnt?.nome_cliente_avulso || primeiraEnt?.destino || "sem entregas";
  return `${rotuloPedido(p.numero, p.id)} · ${clienteOuDestino} · ${nEnt} entrega${nEnt !== 1 ? "s" : ""}`;
}

export function EtapaSelecionarPedido({
  carregandoOpcoes,
  opcoesPedido,
  pedidoSelecionadoId,
  onChangePedido,
  onConfirmar,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirmar = () => {
    setConfirming(true);
    onConfirmar();
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>
        Selecionar pedido de destino
      </h2>
      <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px" }}>
        Escolha o pedido ao qual as notas serão anexadas como entregas.
      </p>

      {carregandoOpcoes && (
        <p style={{ fontSize: "13px", color: "#2563eb" }}>Carregando pedidos...</p>
      )}

      {!carregandoOpcoes && opcoesPedido.length === 0 && (
        <Alert variant="warning">
          Nenhum pedido ativo encontrado. Crie um pedido antes de importar notas.
        </Alert>
      )}

      {!carregandoOpcoes && opcoesPedido.length > 0 && (
        <>
          <FormField label="Pedido">
            <select
              value={pedidoSelecionadoId}
              onChange={(e) => onChangePedido(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Selecione um pedido —</option>
              {opcoesPedido.map((p) => (
                <option key={p.id} value={p.id}>
                  {labelPedido(p)}
                </option>
              ))}
            </select>
          </FormField>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <Btn
              type="button"
              variant="primary"
              disabled={!pedidoSelecionadoId || confirming}
              loading={confirming}
              onClick={handleConfirmar}
            >
              {confirming ? "Carregando..." : "Continuar com este pedido"}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

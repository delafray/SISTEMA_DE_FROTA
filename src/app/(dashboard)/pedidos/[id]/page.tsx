"use client";

/**
 * Redirect — o detalhe do pedido agora vive em /despacho/[id] (decisão do dono
 * 10/06/2026: Despacho é o cérebro da operação; a área Pedidos guarda só o
 * cadastro/edição). Esta rota fica de pé pra não quebrar links antigos
 * (dashboard, financeiro, importação, bot, favoritos).
 *
 * Obs.: pagamento/parcelas do pedido se tratam no Financeiro por Cliente
 * (/faturamento → 💳 Financeiro do pedido) — financeiro é financeiro,
 * logística é logística.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PedidoRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/despacho/${id}`);
  }, [id, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Abrindo no Despacho…
    </div>
  );
}

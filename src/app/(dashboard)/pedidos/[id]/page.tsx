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

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PedidoRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (id) router.replace(`/despacho/${id}`);
    // Sem id (ou redirect que não disparou): o timeout vira a saída de emergência
    // — cobre os dois casos sem setState síncrono no effect.
    const t = setTimeout(() => setErro(true), id ? 3000 : 0);
    return () => clearTimeout(t);
  }, [id, router]);

  if (erro) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", color: "#64748b" }}>
        <span>Não foi possível abrir o pedido.</span>
        <button
          onClick={() => router.push("/pedidos")}
          style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", color: "#1e293b", fontSize: "14px", cursor: "pointer", minHeight: "44px" }}
        >
          Voltar para Pedidos
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Abrindo no Despacho…
    </div>
  );
}

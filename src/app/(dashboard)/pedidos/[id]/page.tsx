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
import { Btn } from "@/components/ui/ds";

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
        <Btn variant="outline" onClick={() => router.push("/pedidos")}>
          Voltar para Pedidos
        </Btn>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "#64748b" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="#cbd5e1" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#2563eb" strokeWidth="3" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
      <span>Abrindo no Despacho…</span>
    </div>
  );
}

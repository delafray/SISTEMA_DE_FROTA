"use client";

/**
 * Modal "Rota do pedido" — VISUALIZADOR do mapa na lista do Despacho.
 *
 * Decisão do dono (10/06/2026): NÃO se roteiriza pelo sistema web — a rota é
 * montada e otimizada pelo MOTORISTA no celular. O painel só acompanha (mapa,
 * execução na aba Rota do detalhe) e alimenta o pedido jogando as notas
 * fiscais (endereço + itens) via importação.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui/ds";
import { MapaRota, type MapaRotaProps } from "@/components/MapaRota";

type ParadaMapa = MapaRotaProps["paradas"][number];

export function ModalRota({
  pedidoId,
  onClose,
}: {
  pedidoId: string;
  onClose: () => void;
}) {
  const [paradas, setParadas] = useState<ParadaMapa[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarParadas = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("paradas")
      .select("id,ordem,latitude,longitude,endereco,fixada,concluida_em")
      .eq("pedido_id", pedidoId)
      .order("ordem", { ascending: true });
    setParadas((data ?? []) as unknown as ParadaMapa[]);
  }, [pedidoId]);

  useEffect(() => {
    (async () => {
      await carregarParadas();
      setLoading(false);
    })();
  }, [carregarParadas]);

  return (
    <div
      className="m-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        className="m-modal-content m-modal-body"
        style={{ background: "#fff", borderRadius: "12px", padding: "20px", width: "100%", maxWidth: "760px", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>🗺️ Rota do pedido</div>
          <Btn variant="ghost" size="xs" onClick={onClose}>✕ Fechar</Btn>
        </div>

        {loading ? (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Carregando rota…</p>
        ) : paradas.length > 0 ? (
          <div style={{ maxHeight: "60vh", overflow: "hidden" }}>
            <MapaRota paradas={paradas} altura={420} />
          </div>
        ) : (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            Nenhuma rota montada ainda — o motorista monta e otimiza a rota no celular;
            quando ele criar, o mapa aparece aqui.
          </p>
        )}
      </div>
    </div>
  );
}

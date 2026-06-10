"use client";

/**
 * Modal "Rota do pedido" — vive no DESPACHO (decisão do dono 10/06: roteirizar
 * é assunto de despacho/operação, não da tela do pedido).
 *
 * Mostra o mapa das paradas já roteirizadas do pedido e o botão
 * Roteirizar/Re-roteirizar (chama /api/routing/otimizar com o motorista do
 * pedido; o servidor parte do depósito/endereço da empresa).
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Alert } from "@/components/ui/ds";
import { MapaRota, type MapaRotaProps } from "@/components/MapaRota";

type ParadaMapa = MapaRotaProps["paradas"][number];

export function ModalRota({
  pedidoId,
  empresaId,
  motoristaId,
  onClose,
}: {
  pedidoId: string;
  empresaId: string;
  motoristaId: string | null;
  onClose: () => void;
}) {
  const [paradas, setParadas] = useState<ParadaMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [roteirizando, setRoteirizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "success" | "error" | "info"; texto: string } | null>(null);

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

  const roteirizar = async () => {
    if (!motoristaId) {
      setMsg({ tipo: "error", texto: "Pedido sem motorista — despache antes de roteirizar." });
      return;
    }
    setRoteirizando(true);
    setMsg({ tipo: "info", texto: "Geocodificando os destinos e otimizando a rota… (pode levar alguns segundos)" });
    try {
      const res = await fetch("/api/routing/otimizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // origem omitida de propósito: o servidor usa o depósito (endereço da empresa).
        body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId, pedido_id: pedidoId }),
      });
      const json = await res.json();
      if (!res.ok) {
        const motivo = json?.motivo ? ` (${json.motivo})` : "";
        const dica = json?.error === "otimizacao_falhou"
          ? " — verifique se o VROOM_URL está configurado."
          : json?.error === "todas_geocoding_falharam"
          ? " — nenhum destino pôde ser geocodificado (endereços muito vagos?)."
          : "";
        setMsg({ tipo: "error", texto: `Falha ao roteirizar: ${json?.error ?? res.status}${motivo}${dica}` });
        return;
      }
      await carregarParadas();
      const naoAtend = Array.isArray(json?.nao_atendidas) ? json.nao_atendidas.length : 0;
      const nParadas = Array.isArray(json?.paradas) ? json.paradas.length : 0;
      const km = typeof json?.distancia_total_km === "number" ? json.distancia_total_km.toFixed(1) : "?";
      setMsg(
        naoAtend > 0
          ? { tipo: "info", texto: `Rota gerada com ${nParadas} parada(s). ${naoAtend} entrega(s) ficaram de fora (endereço não geocodificado).` }
          : { tipo: "success", texto: `✓ Rota otimizada: ${nParadas} parada(s), ${km} km.` }
      );
    } catch (e) {
      setMsg({ tipo: "error", texto: `Erro de rede ao roteirizar: ${(e as Error).message}` });
    } finally {
      setRoteirizando(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: "12px", padding: "20px", width: "100%", maxWidth: "760px", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>🗺️ Rota do pedido</div>
          <Btn variant="ghost" size="xs" onClick={onClose}>✕ Fechar</Btn>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
          <Btn variant="primary" disabled={roteirizando || !motoristaId} onClick={roteirizar}>
            {roteirizando ? "Roteirizando…" : paradas.length > 0 ? "🔄 Re-roteirizar" : "🧭 Roteirizar"}
          </Btn>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            {!motoristaId
              ? "Pedido sem motorista — despache primeiro."
              : "Parte do depósito (endereço da empresa) e ordena os destinos das entregas."}
          </span>
        </div>

        {msg && (
          <div style={{ marginBottom: "12px" }}>
            <Alert variant={msg.tipo === "success" ? "success" : msg.tipo === "error" ? "error" : "info"}>
              {msg.texto}
            </Alert>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Carregando rota…</p>
        ) : paradas.length > 0 ? (
          <MapaRota paradas={paradas} altura={420} />
        ) : (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            Nenhuma rota gerada ainda. Clique em <strong>Roteirizar</strong> para calcular a ordem ótima das entregas.
          </p>
        )}
      </div>
    </div>
  );
}

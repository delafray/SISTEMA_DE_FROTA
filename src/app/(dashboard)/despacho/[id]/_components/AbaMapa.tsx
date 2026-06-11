"use client";

/**
 * Aba "Mapa" do detalhe do despacho.
 * Renderiza o MapaRota quando há paradas — guia habilitada apenas quando o
 * motorista já montou a rota no celular (paradas.length > 0).
 * Atualiza sozinho a cada 10s (polling na page, não aqui).
 */

import { MapaRota } from "@/components/MapaRota";
import { Bloco } from "./shared";
import { COR_ROTA, type ParadaMapa } from "./types";

export type AbaMapaProps = {
  paradas: ParadaMapa[];
};

export function AbaMapa({ paradas }: AbaMapaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>
      {/* ══ MAPA — só existe quando a rota está montada/em execução ═══ */}
      <Bloco titulo="🗺️ Mapa da Rota" cor={COR_ROTA}>
        {paradas.length > 0 ? (
          <>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 10px" }}>
              Rota montada pelo motorista — pinos verdes são locais já entregues. Atualiza sozinho a cada 10s.
            </p>
            <MapaRota paradas={paradas} altura={420} />
          </>
        ) : (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
            Sem rota montada — esta guia habilita quando o motorista criar a rota no celular.
          </p>
        )}
      </Bloco>
    </div>
  );
}

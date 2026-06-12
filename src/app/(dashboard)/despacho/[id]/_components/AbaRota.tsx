"use client";

/**
 * Aba "Rota" do detalhe do despacho.
 * Exibe dois blocos:
 *   1. Notas do Pedido — importação XML (link para /pedidos/importar)
 *   2. Execução da Rota — montagem em tempo real (notas capturadas pelo
 *      motorista), cabeçalho da rota e baixas por local.
 *
 * Esta aba é atualizada a cada 10s pela page (polling na page, não aqui).
 */

import { Badge } from "@/components/ui/ds";
import { Btn } from "@/components/ui/ds";
import { Bloco, Row } from "./shared";
import {
  COR_ROTA, COR_ENTREGAS,
  ROTA_STATUS_LABEL, ROTA_STATUS_VAR,
  fmtDT,
  enderecoParada,
  type NotaMontagem,
  type RotaExec,
  type ParadaMapa,
} from "./types";

export type AbaRotaProps = {
  pedidoId: string;
  notasMontagem: NotaMontagem[];
  rotaExec: RotaExec | null;
  paradas: ParadaMapa[];
};

export function AbaRota({ pedidoId, notasMontagem, rotaExec, paradas }: AbaRotaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>

      {/* ══ NOTAS DO PEDIDO (importação: endereço + itens — SEM mapa) ═ */}
      <Bloco
        titulo="📥 Notas do Pedido"
        cor={COR_ROTA}
        acoes={
          <Btn href={`/pedidos/importar?pedido_id=${pedidoId}`} variant="primary" size="xs">
            📥 Importar notas (XML)
          </Btn>
        }
      >
          <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 0", lineHeight: 1.6 }}>
            Importe as notas fiscais para registrar os <strong>endereços de entrega</strong> deste pedido.
            O sistema captura automaticamente os dados de cada nota.
          </p>
      </Bloco>

      {/* ══ EXECUÇÃO DA ROTA — tempo real do que o motorista faz ══════ */}
      <Bloco titulo="⏱️ Execução da Rota" cor={COR_ENTREGAS}>
        {/* EM MONTAGEM: o que o motorista está cadastrando AGORA (10s) */}
        {notasMontagem.length > 0 && (
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700, marginBottom: "6px" }}>
              🧱 Em montagem — motorista cadastrando ({notasMontagem.length}) · atualiza sozinho a cada 10s
            </div>
            {notasMontagem.map((n, i) => (
              <div key={n.id} style={{
                display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                padding: "7px 10px", marginBottom: "4px",
                background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px",
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e40af", minWidth: "20px" }}>{i + 1}º</span>
                <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{enderecoParada(n.endereco)}</span>
                <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>
                  {n.status === "geocodificada" ? "📍 localizada" : "⏳ capturada"}
                  {n.capturado_em ? ` · ${fmtDT(n.capturado_em)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {!rotaExec && paradas.length === 0 && notasMontagem.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: "6px 0" }}>
            Nada ainda. Assim que o motorista começar a cadastrar os destinos no celular,
            eles aparecem <strong>aqui em tempo real</strong>; depois vem a execução —
            quando a rota foi salva, quando começou e a hora da baixa em cada local.
          </p>
        ) : (
          <>
            {rotaExec && (
              <>
                <Row label="Situação" value={
                  <Badge variant={ROTA_STATUS_VAR[rotaExec.status] ?? "default"}>
                    {ROTA_STATUS_LABEL[rotaExec.status] ?? rotaExec.status}
                  </Badge>
                } />
                <Row label="Rota salva em" value={fmtDT(rotaExec.criada_em)} />
                {rotaExec.otimizada_em && <Row label="Otimizada em" value={fmtDT(rotaExec.otimizada_em)} />}
                {(rotaExec.distancia_total_km != null || rotaExec.tempo_total_min != null) && (
                  <Row label="Distância / tempo previsto" value={
                    [
                      rotaExec.distancia_total_km != null ? `${rotaExec.distancia_total_km.toFixed(1)} km` : null,
                      rotaExec.tempo_total_min != null ? `≈${Math.round(rotaExec.tempo_total_min)} min` : null,
                    ].filter(Boolean).join(" · ")
                  } />
                )}
                {(() => {
                  const baixas = paradas
                    .map(p => (p as { concluida_em?: string | null }).concluida_em)
                    .filter((d): d is string => !!d)
                    .sort();
                  return baixas.length > 0
                    ? <Row label="Começou (1ª baixa)" value={fmtDT(baixas[0])} />
                    : <Row label="Começou" value="ainda sem baixas" />;
                })()}
              </>
            )}

            {/* baixa de cada local, na ordem da rota */}
            {paradas.length > 0 && (
              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                  📍 Baixas por local ({paradas.filter(p => (p as { concluida_em?: string | null }).concluida_em).length}/{paradas.length})
                </div>
                {paradas.map(p => {
                  const par = p as { id: string; ordem: number; endereco: unknown; concluida_em?: string | null };
                  return (
                    <div key={par.id} style={{
                      display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                      padding: "7px 10px", marginBottom: "4px",
                      background: par.concluida_em ? "#f0fdf4" : "#f8fafc",
                      border: "1px solid " + (par.concluida_em ? "#bbf7d0" : "#e2e8f0"),
                      borderRadius: "8px",
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: "20px", height: "20px", padding: "0 5px",
                        borderRadius: "10px", background: par.concluida_em ? "#16a34a" : "#94a3b8",
                        color: "#fff", fontSize: "11px", fontWeight: 700,
                      }}>{par.ordem}</span>
                      <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{enderecoParada(par.endereco)}</span>
                      {par.concluida_em ? (
                        <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, whiteSpace: "nowrap" }}>
                          ✓ baixa {fmtDT(par.concluida_em)}
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>pendente</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Bloco>

    </div>
  );
}

"use client";

// ─── Etapa 3: Preview das entregas antes de confirmar importação ──────────────

import { useState } from "react";
import { Alert, Btn, Badge, DataTable, Th, Td, Tr } from "@/components/ui/ds";
import type { LinhaPreview, PedidoAlvo } from "./tipos";
import { fmtValor } from "./tipos";
import { CabecalhoPedido } from "./CabecalhoPedido";

type FalhaUnificada = { origem: string; motivo: string };

type Props = {
  pedidoAlvo: PedidoAlvo;
  linhasPreview: LinhaPreview[];
  selecionadas: Set<number>;
  onToggleLinha: (idx: number) => void;
  onToggleTodas: () => void;

  todasFalhas: FalhaUnificada[];
  falhasExpandidas: boolean;
  onToggleFalhas: () => void;

  errImport: string;
  importando: boolean;
  onImportar: () => void;
  onVoltar: () => void;
};

export function EtapaPreview({
  pedidoAlvo,
  linhasPreview,
  selecionadas,
  onToggleLinha,
  onToggleTodas,
  todasFalhas,
  falhasExpandidas,
  onToggleFalhas,
  errImport,
  importando,
  onImportar,
  onVoltar,
}: Props) {
  const countSelecionadas = selecionadas.size;
  const [confirmandoImport, setConfirmandoImport] = useState(false);

  return (
    <>
      {errImport && <Alert variant="error">{errImport}</Alert>}

      {todasFalhas.length > 0 && (
        <Alert variant="warning">
          {todasFalhas.length} arquivo(s)/linha(s) não puderam ser importados (veja abaixo).
        </Alert>
      )}

      {/* Cabeçalho do pedido alvo */}
      <CabecalhoPedido pedido={pedidoAlvo} />

      {/* Tabela de preview */}
      <DataTable
        toolbar={
          <span style={{ fontSize: "13px", color: "#475569" }}>
            <strong>{countSelecionadas}</strong> de {linhasPreview.length} selecionadas
          </span>
        }
      >
        <thead>
          <tr>
            <Th style={{ width: "40px" }}>
              <input
                type="checkbox"
                checked={
                  linhasPreview.filter((l) => !l.jaImportada).length > 0 &&
                  linhasPreview.filter((l) => !l.jaImportada).every((l) => selecionadas.has(l.idx))
                }
                onChange={onToggleTodas}
                style={{ accentColor: "#2563eb" }}
              />
            </Th>
            <Th>Destinatário / Cliente</Th>
            <Th className="m-hide">Endereço</Th>
            <Th className="m-hide">Nº Nota</Th>
            <Th className="m-hide" style={{ textAlign: "right" }}>Valor da Nota</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {linhasPreview.map((l) => (
            <Tr key={l.idx} muted={l.jaImportada}>
              <Td>
                <input
                  type="checkbox"
                  checked={selecionadas.has(l.idx)}
                  disabled={l.jaImportada}
                  onChange={() => onToggleLinha(l.idx)}
                  style={{ accentColor: "#2563eb" }}
                />
              </Td>
              <Td style={{ fontWeight: 500 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.destinatario || "—"}</div>
                <div className="m-show-block" style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} title={l.endereco}>
                  {l.endereco}
                </div>
              </Td>
              <Td className="m-hide" style={{ maxWidth: "280px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.endereco}
              </Td>
              <Td className="m-hide">{l.numeroNota || "—"}</Td>
              <Td className="m-hide" style={{ textAlign: "right" }}>{fmtValor(l.valorNota)}</Td>
              <Td>
                {l.jaImportada ? (
                  <Badge variant="warning">Já importada</Badge>
                ) : (
                  <Badge variant="success">OK</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {/* Falhas do parse expandíveis */}
      {todasFalhas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={onToggleFalhas}
            style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: "10px 8px", minHeight: "44px" }}
          >
            {falhasExpandidas ? "▲ Ocultar falhas do parse" : `▼ Ver ${todasFalhas.length} falha(s) do parse`}
          </button>
          {falhasExpandidas && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {todasFalhas.map((f, i) => (
                <div key={i} style={{
                  padding: "8px 12px", background: "#fef2f2", borderRadius: "6px",
                  fontSize: "12px", color: "#991b1b",
                }}>
                  <strong>{f.origem}</strong>: {f.motivo}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "32px" }}>
        <Btn type="button" variant="outline" onClick={onVoltar}>
          Voltar
        </Btn>
        <Btn
          type="button"
          variant="primary"
          disabled={importando || countSelecionadas === 0}
          loading={importando}
          onClick={() => setConfirmandoImport(true)}
          style={{ minWidth: "200px", minHeight: "44px", padding: "10px 20px", fontSize: "14px" }}
        >
          {importando
            ? "Importando..."
            : `Anexar ${countSelecionadas} entrega${countSelecionadas !== 1 ? "s" : ""} ao pedido`}
        </Btn>
      </div>

      {/* Modal de confirmação de importação em massa */}
      {confirmandoImport && (
        <div
          className="m-modal-overlay"
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="m-modal-content m-modal-body"
            style={{
              background: "#fff", borderRadius: "12px", padding: "28px",
              width: "100%", maxWidth: "420px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 12px" }}>
              Confirmar importação?
            </h3>
            <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 8px" }}>
              Pedido de destino: <strong>{pedidoAlvo.numero ?? pedidoAlvo.id}</strong>
            </p>
            <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 24px" }}>
              Serão anexadas <strong>{countSelecionadas}</strong> entrega{countSelecionadas !== 1 ? "s" : ""} a este pedido. Esta ação não pode ser desfeita facilmente.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn type="button" variant="ghost" onClick={() => setConfirmandoImport(false)}>
                Voltar
              </Btn>
              <Btn type="button" variant="primary" onClick={() => { setConfirmandoImport(false); onImportar(); }}
                style={{ minHeight: "44px" }}>
                Confirmar e importar
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

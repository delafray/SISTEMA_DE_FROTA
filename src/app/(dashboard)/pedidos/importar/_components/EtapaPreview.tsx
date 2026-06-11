"use client";

// ─── Etapa 3: Preview das entregas antes de confirmar importação ──────────────

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
            <Th>Endereço</Th>
            <Th>Nº Nota</Th>
            <Th style={{ textAlign: "right" }}>Valor da Nota</Th>
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
              <Td style={{ fontWeight: 500 }}>{l.destinatario || "—"}</Td>
              <Td style={{ maxWidth: "280px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.endereco}
              </Td>
              <Td>{l.numeroNota || "—"}</Td>
              <Td style={{ textAlign: "right" }}>{fmtValor(l.valorNota)}</Td>
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
            style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
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
          onClick={onImportar}
          style={{ minWidth: "200px" }}
        >
          {importando
            ? "Importando..."
            : `Anexar ${countSelecionadas} entrega${countSelecionadas !== 1 ? "s" : ""} ao pedido`}
        </Btn>
      </div>
    </>
  );
}

"use client";

/**
 * Linha da tabela desktop na fila de despacho.
 * Extraído de despacho/page.tsx — sem mudança de comportamento ou visual.
 */

import { Tr, Td, Badge, Btn } from "@/components/ui/ds";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
import {
  type PedidoDespacho,
  type EntregaLite,
  STATUS_VAR,
  STATUS_LABEL,
  fmtDate,
  fmtDataCadastro,
  resumoDestinos,
  one,
} from "./tiposDespacho";

type Props = {
  p: PedidoDespacho;
  entregas: EntregaLite[];
  cliente: string;
  selecionado: boolean;
  onToggle: () => void;
  onDespachar: () => void;
  onTrocar: () => void;
  onVerRota: () => void;
};

export function LinhaDespacho({
  p, entregas, cliente,
  selecionado, onToggle, onDespachar, onTrocar, onVerRota,
}: Props) {
  const veicObj    = one<{ placa: string; apelido: string | null; modelo: string }>(p.veiculos);
  const motObj     = one<{ nome: string }>(p.motoristas);
  const veicLabel  = veicObj
    ? (veicObj.apelido?.trim() ? `${veicObj.apelido} (${veicObj.placa})` : `${veicObj.placa} — ${veicObj.modelo}`)
    : null;
  const despachado = !!(veicLabel || motObj);

  return (
    <Tr style={{ background: selecionado ? "#eff6ff" : undefined }}>

      {/* Checkbox de seleção */}
      <Td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={selecionado}
          onChange={onToggle}
          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
        />
      </Td>

      {/* Número do pedido */}
      <Td style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap" }}>
        {rotuloPedido(p.numero, p.id)}
      </Td>

      {/* Cliente */}
      <Td>
        <div style={{ fontWeight: 600, color: "#1e293b" }}>{cliente}</div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
          Cadastrado em {fmtDataCadastro(p.created_at)}
        </div>
      </Td>

      {/* Data prevista */}
      <Td>{fmtDate(p.data_inicio_prevista)}</Td>

      {/* Destinos */}
      <Td style={{ maxWidth: "240px" }}>
        <span style={{ color: "#475569" }}>{resumoDestinos(entregas)}</span>
      </Td>

      {/* Caminhão / Motorista */}
      <Td style={{ fontSize: "12px" }}>
        {veicLabel || motObj ? (
          <>
            <div style={{ fontWeight: 600, color: "#1e293b" }}>{veicLabel ?? "—"}</div>
            <div style={{ color: "#64748b" }}>{motObj?.nome ?? "—"}</div>
          </>
        ) : (
          <Badge variant="warning">Não despachado</Badge>
        )}
      </Td>

      {/* Status */}
      <Td>
        <Badge variant={STATUS_VAR[p.status] ?? "default"}>
          {STATUS_LABEL[p.status] ?? p.status}
        </Badge>
      </Td>

      {/* Ações */}
      <Td>
        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
          <Btn href={`/despacho/${p.id}`} variant="ghost" size="xs">Ver</Btn>
          {!despachado ? (
            <>
              <Btn variant="primary" size="xs" onClick={onDespachar}>
                Despachar
              </Btn>
              <Btn
                href={`/pedidos/importar?pedido_id=${p.id}`}
                variant="ghost"
                size="xs"
                title="Importar notas (XML) para este pedido"
              >
                📥 Notas
              </Btn>
            </>
          ) : (
            <>
              <Btn
                variant="outline"
                size="xs"
                onClick={onVerRota}
                title="Ver o mapa da rota montada pelo motorista"
              >
                🗺️ Rota
              </Btn>
              <Btn variant="outline" size="xs" onClick={onTrocar}>
                Trocar
              </Btn>
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}

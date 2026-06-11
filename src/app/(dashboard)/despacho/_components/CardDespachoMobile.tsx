"use client";

/**
 * Card mobile de um pedido na fila de despacho.
 * Extraído de despacho/page.tsx — sem mudança de comportamento ou visual.
 */

import { Badge, Btn } from "@/components/ui/ds";
import { MobileCard } from "@/components/mobile";
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

export function CardDespachoMobile({
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
    <MobileCard
      title={`${rotuloPedido(p.numero, p.id)} · ${cliente}`}
      subtitle={resumoDestinos(entregas)}
      badge={
        <Badge variant={STATUS_VAR[p.status] ?? "default"}>
          {STATUS_LABEL[p.status] ?? p.status}
        </Badge>
      }
      highlight={selecionado ? "#2563eb" : "#e2e8f0"}
      details={[
        { label: "Previsto",   value: fmtDate(p.data_inicio_prevista) },
        { label: "Caminhão",   value: veicLabel ?? "Não despachado" },
        { label: "Motorista",  value: motObj?.nome ?? "—" },
        { label: "Cadastrado", value: fmtDataCadastro(p.created_at) },
      ]}
      actions={
        !despachado ? (
          <div style={{ display: "flex", gap: "8px", width: "100%" }}>
            <Btn href={`/despacho/${p.id}`} variant="outline" size="sm">Ver</Btn>
            <Btn
              variant="primary"
              size="sm"
              onClick={onDespachar}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Despachar
            </Btn>
            <Btn
              href={`/pedidos/importar?pedido_id=${p.id}`}
              variant="ghost"
              size="sm"
              title="Importar notas (XML)"
            >
              📥
            </Btn>
            <Btn
              variant={selecionado ? "outline" : "ghost"}
              size="sm"
              onClick={onToggle}
            >
              {selecionado ? "Tirar" : "Marcar"}
            </Btn>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", width: "100%" }}>
            <Btn href={`/despacho/${p.id}`} variant="outline" size="sm">Ver</Btn>
            <Btn variant="outline" size="sm" onClick={onVerRota}>
              🗺️ Rota
            </Btn>
            <Btn
              variant="outline"
              size="sm"
              onClick={onTrocar}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Trocar
            </Btn>
          </div>
        )
      }
    />
  );
}

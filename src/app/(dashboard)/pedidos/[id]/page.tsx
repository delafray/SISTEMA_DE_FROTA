"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, Btn, Badge,
  DataTable, Th, Td, Tr,
} from "@/components/ui/ds";

type Pedido = {
  id: string;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  created_at: string | null;
  valor_pedido: number | null;
  pago: boolean | null;
  forma_pagamento: string | null;
  data_pagamento: string | null;
  motoristas: { id: string; nome: string } | null;
  veiculos: { id: string; placa: string; marca: string; modelo: string } | null;
};

type EntregaPedido = {
  id: string;
  origem: string | null;
  destino: string | null;
  status: string;
  data_coleta_prevista: string | null;
  clientes: { nome_fantasia: string } | null;
};

type ResultadoFinanceiro = {
  receita: number;
  custo_combustivel: number;
  custo_despesas: number;
  custo_total: number;
  lucro_bruto: number;
  margem_pct: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada", em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", em_andamento: "info", concluida: "success", cancelada: "danger",
};
const ENTREGA_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const ENTREGA_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const fmtDT   = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function PedidoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [entregas, setEntregas] = useState<EntregaPedido[]>([]);
  const [resultado, setResultado] = useState<ResultadoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [pedidoRes, entregasRes] = await Promise.all([
        supabase.from("pedidos")
          .select("id,status,data_inicio_prevista,data_fim_prevista,data_inicio_real,data_fim_real,km_inicial,km_final,observacoes,created_at,valor_pedido,pago,forma_pagamento,data_pagamento,motoristas(id,nome),veiculos(id,placa,marca,modelo)")
          .eq("id", id)
          .single(),
        supabase.from("entregas")
          .select("id,origem,destino,status,data_coleta_prevista,clientes(nome_fantasia)")
          .eq("pedido_id", id)
          .order("data_coleta_prevista", { ascending: true }),
      ]);
      const pedidoData = pedidoRes.data as unknown as Pedido | null;
      setPedido(pedidoData);
      setEntregas((entregasRes.data ?? []) as unknown as EntregaPedido[]);

      // Carrega resultado financeiro: receita do pedido + custos via veiculos_resultado_periodo
      if (pedidoData) {
        const receita = pedidoData.valor_pedido ?? 0;
        let custo_combustivel = 0;
        let custo_despesas = 0;

        const veiculoId = (Array.isArray(pedidoData.veiculos) ? pedidoData.veiculos[0] : pedidoData.veiculos)?.id;
        const mesRef = pedidoData.data_inicio_real ?? pedidoData.data_inicio_prevista ?? pedidoData.created_at;
        if (veiculoId && mesRef) {
          const mesInicio = new Date(mesRef);
          mesInicio.setUTCDate(1);
          mesInicio.setUTCHours(0, 0, 0, 0);
          const mesISO = mesInicio.toISOString().slice(0, 10);
          const { data: vrp } = await supabase
            .from("veiculos_resultado_periodo")
            .select("custo_combustivel,custo_despesas")
            .eq("veiculo_id", veiculoId)
            .eq("mes_referencia", mesISO)
            .maybeSingle();
          if (vrp) {
            custo_combustivel = vrp.custo_combustivel ?? 0;
            custo_despesas = vrp.custo_despesas ?? 0;
          }
        }

        const custo_total = custo_combustivel + custo_despesas;
        const lucro_bruto = receita - custo_total;
        setResultado({
          receita,
          custo_combustivel,
          custo_despesas,
          custo_total,
          lucro_bruto,
          margem_pct: receita > 0 ? (lucro_bruto / receita) * 100 : null,
        });
      }

      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeStatus = async (novoStatus: string) => {
    setUpdatingStatus(true);
    const supabase = createClient();
    const extra: Record<string, string> = {};
    if (novoStatus === "em_andamento") extra.data_inicio_real = new Date().toISOString();
    if (novoStatus === "concluida")    extra.data_fim_real    = new Date().toISOString();
    await supabase.from("pedidos").update({ status: novoStatus, ...extra }).eq("id", id);
    setPedido(p => p ? { ...p, status: novoStatus, ...extra } : p);
    setUpdatingStatus(false);
  };

  const desvincularEntrega = async (entregaId: string) => {
    const supabase = createClient();
    await supabase.from("entregas").update({ pedido_id: null }).eq("id", entregaId);
    setEntregas(p => p.filter(f => f.id !== entregaId));
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (!pedido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Pedido não encontrado.
    </div>
  );

  const motorista = Array.isArray(pedido.motoristas) ? pedido.motoristas[0] : pedido.motoristas;
  const veiculo   = Array.isArray(pedido.veiculos)   ? pedido.veiculos[0]   : pedido.veiculos;
  const kmRodado  = pedido.km_final != null && pedido.km_inicial != null ? pedido.km_final - pedido.km_inicial : null;

  const nextStatus =
    pedido.status === "agendada"     ? "em_andamento" :
    pedido.status === "em_andamento" ? "concluida"    : null;

  const nextLabel =
    pedido.status === "agendada"     ? "Iniciar Pedido" :
    pedido.status === "em_andamento" ? "Concluir Pedido" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Pedido — ${motorista?.nome ?? "—"}`}
        subtitle={`Criado em ${fmtDT(pedido.created_at)}`}
        actions={
          <>
            <Btn href="/pedidos" variant="ghost">← Voltar</Btn>
            {nextStatus && (
              <Btn
                variant="primary"
                disabled={updatingStatus}
                onClick={() => changeStatus(nextStatus)}
              >
                {updatingStatus ? "..." : nextLabel}
              </Btn>
            )}
            {pedido.status !== "cancelada" && pedido.status !== "concluida" && (
              <Btn variant="danger" disabled={updatingStatus} onClick={() => changeStatus("cancelada")}>
                Cancelar
              </Btn>
            )}
            <Btn href={`/pedidos/${id}/editar`} variant="outline">Editar</Btn>
          </>
        }
      >
        <Badge variant={STATUS_VAR[pedido.status] ?? "default"}>
          {STATUS_LABEL[pedido.status] ?? pedido.status}
        </Badge>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "900px" }}>

          <FormSection title="Motorista e Veículo">
            <Row label="Motorista" value={<strong>{motorista?.nome ?? "—"}</strong>} />
            <Row label="Veículo"   value={veiculo ? `${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}` : "—"} />
          </FormSection>

          <FormSection title="Datas">
            <Row label="Início Previsto"   value={fmtDate(pedido.data_inicio_prevista)} />
            <Row label="Fim Previsto" value={fmtDate(pedido.data_fim_prevista)} />
            <Row label="Início Real"       value={fmtDT(pedido.data_inicio_real)} />
            <Row label="Fim Real"     value={fmtDT(pedido.data_fim_real)} />
          </FormSection>

          <FormSection title="Quilometragem">
            <Row label="KM Inicial" value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
            <Row label="KM Final"   value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
            {kmRodado != null && (
              <Row label="KM Rodados" value={<strong style={{ color: "#2563eb" }}>{kmRodado.toLocaleString("pt-BR")} km</strong>} />
            )}
          </FormSection>

          <FormSection title="💰 Resultado Financeiro">
            <Row label="Entregas neste pedido" value={<Badge variant="info">{entregas.length}</Badge>} />
            <Row label="Valor do Pedido" value={<strong style={{ color: "#16a34a" }}>{fmtBRL(pedido.valor_pedido)}</strong>} />
            <Row label="Pagamento" value={pedido.pago
              ? <span style={{ color: "#16a34a" }}>✓ Pago {pedido.data_pagamento ? `em ${fmtDate(pedido.data_pagamento)}` : ""}</span>
              : <span style={{ color: "#eab308" }}>Pendente</span>}
            />

            {resultado && resultado.custo_total > 0 && (
              <>
                <div style={{ height: "1px", background: "#f1f5f9", margin: "6px 0" }} />
                {resultado.custo_combustivel > 0 && (
                  <Row label="(-) Combustível (mês)" value={<span style={{ color: "#dc2626" }}>- {fmtBRL(resultado.custo_combustivel)}</span>} />
                )}
                {resultado.custo_despesas > 0 && (
                  <Row label="(-) Despesas do veículo (mês)" value={<span style={{ color: "#dc2626" }}>- {fmtBRL(resultado.custo_despesas)}</span>} />
                )}
                <div style={{ height: "1px", background: "#e2e8f0", margin: "6px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>💵 Lucro Bruto (aprox.)</span>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{
                      fontSize: "15px",
                      color: resultado.lucro_bruto >= 0 ? "#16a34a" : "#dc2626"
                    }}>
                      {fmtBRL(resultado.lucro_bruto)}
                    </strong>
                    {resultado.margem_pct != null && (
                      <div style={{
                        fontSize: "11px", fontWeight: 700,
                        color: resultado.margem_pct >= 15 ? "#16a34a" : resultado.margem_pct >= 0 ? "#d97706" : "#dc2626"
                      }}>
                        {resultado.margem_pct.toFixed(1)}% de margem
                      </div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px", marginBottom: 0 }}>
                  Custos consolidados por veículo no mês do pedido.
                </p>
              </>
            )}

            {resultado && resultado.custo_total === 0 && (
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px", marginBottom: 0 }}>
                📌 Nenhuma despesa registrada no mês para este veículo.
              </p>
            )}
          </FormSection>

          {pedido.observacoes && (
            <div style={{ gridColumn: "span 2" }}>
              <FormSection title="Observações">
                <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
              </FormSection>
            </div>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <FormSection title={`Entregas deste Pedido (${entregas.length})`}>
              {entregas.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhuma entrega vinculada.</p>
                  <Btn href={`/pedidos/${id}/editar`} variant="outline" size="xs">Adicionar Entregas</Btn>
                </div>
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Rota</Th>
                      <Th>Cliente</Th>
                      <Th>Coleta Prevista</Th>
                      <Th>Status</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map(fr => {
                      const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                      return (
                        <Tr key={fr.id}>
                          <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                          <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                          <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                          <Td>
                            <Badge variant={ENTREGA_STATUS_VAR[fr.status] ?? "default"}>
                              {ENTREGA_STATUS_LABEL[fr.status] ?? fr.status}
                            </Badge>
                          </Td>
                          <Td>
                            <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                              <Btn href={`/entregas/${fr.id}`} variant="ghost" size="xs">Ver</Btn>
                              <button
                                onClick={() => desvincularEntrega(fr.id)}
                                style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                                title="Remover do pedido"
                              >
                                Desvincular
                              </button>
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              )}
            </FormSection>
          </div>

        </div>
      </div>
    </div>
  );
}

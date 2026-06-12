"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Btn, Badge, FormSection, DataTable, Th, Td, Tr } from "@/components/ui/ds";

type Abastecimento = {
  id: string;
  km_no_abast: number | null;
  litros: number;
  valor_litro: number | null;
  valor_total: number;
  posto: string | null;
  confirmado: boolean | null;
  created_at: string | null;
};

type Detalhe = {
  id: string; status: string;
  valor_pedido: number | null; km_inicial: number | null; km_final: number | null;
  data_inicio_prevista: string | null; data_fim_prevista: string | null;
  data_inicio_real: string | null; data_fim_real: string | null;
  forma_pagamento: string | null; observacoes: string | null;
  pago: boolean | null; data_pagamento: string | null;
  observacoes_financeiras: string | null;
  created_at: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
};

type Veiculo   = { placa: string; modelo: string; marca: string } | null;
type Motorista = { nome: string } | null;
type Entrega   = { id: string; origem: string; destino: string; status: string; tipo_carga: string | null;
  clientes: { nome_fantasia: string } | { nome_fantasia: string }[] | null;
  nome_cliente_avulso: string | null; };

const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};
const PGTO_LABEL: Record<string, string> = {
  a_vista: "À vista", "7d": "7 dias", "14d": "14 dias", "21d": "21 dias",
  "30d": "30 dias", "45d": "45 dias", "60d": "60 dias", outros: "Outros",
};

const fmtBRL = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: "13px", color: highlight ? "#166534" : "#1e293b", fontWeight: highlight ? 700 : 500 }}>{value}</span>
    </div>
  );
}

export default function PedidoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Detalhe | null>(null);
  const [veiculo, setVeiculo] = useState<Veiculo>(null);
  const [motorista, setMotorista] = useState<Motorista>(null);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const pedidoRes = await supabase
        .from("pedidos")
        .select("id,status,valor_pedido,km_inicial,km_final,data_inicio_prevista,data_fim_prevista,data_inicio_real,data_fim_real,forma_pagamento,observacoes,pago,data_pagamento,observacoes_financeiras,created_at,veiculo_id,motorista_id")
        .eq("id", id)
        .single();

      const p = pedidoRes.data as Detalhe | null;
      setPedido(p);

      if (p?.veiculo_id) {
        const { data: vData } = await supabase.from("veiculos").select("placa,modelo,marca").eq("id", p.veiculo_id).single();
        setVeiculo(vData ?? null);

        const { data: abastData } = await supabase
          .from("abastecimentos")
          .select("id,km_no_abast,litros,valor_litro,valor_total,posto,confirmado,created_at")
          .eq("veiculo_id", p.veiculo_id)
          .order("created_at", { ascending: true })
          .limit(50);
        setAbastecimentos(abastData ?? []);
      }

      if (p?.motorista_id) {
        const { data: mData } = await supabase.from("motoristas").select("nome").eq("id", p.motorista_id).single();
        setMotorista(mData ?? null);
      }

      const { data: entData } = await supabase
        .from("entregas")
        .select("id,origem,destino,status,tipo_carga,nome_cliente_avulso,clientes(nome_fantasia)")
        .eq("pedido_id", id)
        .order("created_at", { ascending: true });
      setEntregas((entData ?? []) as Entrega[]);

      setLoading(false);
    };
    load();
  }, [id]);

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

  const kmRodado = pedido.km_final != null && pedido.km_inicial != null
    ? pedido.km_final - pedido.km_inicial : null;

  const primeiraEntrega = entregas[0];
  const clienteEntrega = primeiraEntrega
    ? (Array.isArray(primeiraEntrega.clientes) ? primeiraEntrega.clientes[0] : primeiraEntrega.clientes)
    : null;
  const clienteLabel = clienteEntrega?.nome_fantasia ?? primeiraEntrega?.nome_cliente_avulso ?? "Sem cliente";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .frete-print, .frete-print * { visibility: visible !important; }
          .frete-print { position: absolute; inset: 0; padding: 24px !important; background: #fff !important; overflow: visible !important; }
          .frete-print .frete-print-header { display: block !important; }
          .no-print, .no-print * { visibility: hidden !important; display: none !important; }
          .frete-print a, .frete-print button { color: inherit !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title={clienteLabel}
          subtitle={`Criado em ${pedido.created_at ? new Date(pedido.created_at).toLocaleDateString("pt-BR") : "—"}`}
          actions={
            <>
              <Btn href="/entregas" variant="ghost">← Voltar</Btn>
              <Btn variant="outline" onClick={() => window.print()} className="m-hide">🖨️ Imprimir</Btn>
              <Btn href={`/entregas/${id}/editar`} variant="outline">Editar</Btn>
            </>
          }
        >
          <Badge variant={STATUS_VAR[pedido.status] ?? "default"}>
            {STATUS_LABEL[pedido.status] ?? pedido.status}
          </Badge>
        </PageHeader>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }} className="frete-print">
        <div className="frete-print-header" style={{ display: "none", marginBottom: "16px" }}>
          <h1 style={{ fontSize: "20px", margin: 0 }}>Ordem de Serviço — Pedido</h1>
          <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
            {clienteLabel} ·{" "}
            {STATUS_LABEL[pedido.status] ?? pedido.status} ·{" "}
            Criado em {pedido.created_at ? new Date(pedido.created_at).toLocaleDateString("pt-BR") : "—"}
          </div>
          <hr style={{ marginTop: "10px", marginBottom: "10px", border: "none", borderTop: "1px solid #cbd5e1" }} />
        </div>

        <div className="m-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "900px" }}>

          <FormSection title="Datas e Quilometragem">
            <Row label="Início Previsto"   value={fmtDate(pedido.data_inicio_prevista)} />
            <Row label="Fim Previsto"      value={fmtDate(pedido.data_fim_prevista)} />
            <Row label="Início Real"       value={fmtDate(pedido.data_inicio_real)} />
            <Row label="Fim Real"          value={fmtDate(pedido.data_fim_real)} />
            <Row label="KM Inicial"        value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
            <Row label="KM Final"          value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
            {kmRodado != null && (
              <Row label="KM Rodados" value={`${kmRodado.toLocaleString("pt-BR")} km`} highlight />
            )}
          </FormSection>

          <FormSection title="Veículo, Motorista e Cliente">
            <Row label="Veículo"    value={veiculo ? `${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}` : "—"} />
            <Row label="Motorista"  value={motorista?.nome ?? "—"} />
            <Row label="Cliente"    value={clienteLabel} />
          </FormSection>

          <FormSection title="Financeiro">
            <Row label="Valor do Pedido"    value={fmtBRL(pedido.valor_pedido)} highlight />
            <Row label="Forma de Pagamento" value={PGTO_LABEL[pedido.forma_pagamento ?? ""] ?? pedido.forma_pagamento ?? "—"} />
            <Row label="Pagamento"
              value={
                pedido.pago
                  ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Pago {pedido.data_pagamento ? `em ${fmtDate(pedido.data_pagamento)}` : ""}</span>
                  : <span style={{ color: "#eab308", fontWeight: 600 }}>Pendente</span>
              }
            />
            {pedido.observacoes_financeiras && (
              <Row label="Obs. Financeiras" value={pedido.observacoes_financeiras} />
            )}
          </FormSection>

          {pedido.observacoes && (
            <FormSection title="Observações Gerais">
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
            </FormSection>
          )}

          {entregas.length > 0 && (
            <div style={{ gridColumn: "span 2", overflowX: "auto" }}>
              <FormSection title={`Entregas do Pedido (${entregas.length})`}>
                <div className="m-hide">
                  <DataTable>
                    <thead>
                      <tr>
                        <Th>Origem</Th>
                        <Th>Destino</Th>
                        <Th>Carga</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregas.map(e => (
                        <Tr key={e.id}>
                          <Td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.origem}>{e.origem}</Td>
                          <Td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.destino}>{e.destino}</Td>
                          <Td>{e.tipo_carga ?? "—"}</Td>
                          <Td>
                            <Badge variant={STATUS_VAR[e.status] ?? "default"}>
                              {STATUS_LABEL[e.status] ?? e.status}
                            </Badge>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>
                <div className="m-show-block" style={{ display: "none", flexDirection: "column", gap: "8px" }}>
                  {entregas.map(e => (
                    <div key={e.id} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <Badge variant={STATUS_VAR[e.status] ?? "default"}>
                          {STATUS_LABEL[e.status] ?? e.status}
                        </Badge>
                        {e.tipo_carga && <span style={{ fontSize: "11px", color: "#64748b" }}>{e.tipo_carga}</span>}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.origem}>
                          <span style={{ fontWeight: 600, color: "#64748b" }}>De: </span>{e.origem}
                        </div>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }} title={e.destino}>
                          <span style={{ fontWeight: 600, color: "#64748b" }}>Para: </span>{e.destino}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </FormSection>
            </div>
          )}

          <div style={{ gridColumn: "span 2", overflowX: "auto" }}>
            <FormSection title={`Abastecimentos do Veículo (${abastecimentos.length})`}>
              <p style={{ fontSize: "11px", color: "#94a3b8", margin: "0 0 8px" }}>Abastecimentos do veículo — todos os registros, não filtrados por pedido.</p>
              {abastecimentos.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhum abastecimento registrado para o veículo.</p>
              ) : (
                <>
                  <div className="m-hide">
                    <DataTable>
                      <thead>
                        <tr>
                          <Th>Data</Th>
                          <Th>Posto</Th>
                          <Th>KM</Th>
                          <Th>Litros</Th>
                          <Th>R$/L</Th>
                          <Th>Total</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {abastecimentos.map(a => (
                          <Tr key={a.id}>
                            <Td>{a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—"}</Td>
                            <Td>{a.posto ?? "—"}</Td>
                            <Td>{a.km_no_abast?.toLocaleString("pt-BR") ?? "—"}</Td>
                            <Td>{a.litros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L</Td>
                            <Td>{a.valor_litro != null ? fmtBRL(a.valor_litro) : "—"}</Td>
                            <Td><strong>{fmtBRL(a.valor_total)}</strong></Td>
                            <Td>
                              {a.confirmado
                                ? <span style={{ color: "#16a34a", fontWeight: 600 }}>Confirmado</span>
                                : <span style={{ color: "#94a3b8" }}>Pendente</span>}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                  <div className="m-show-block" style={{ display: "none", flexDirection: "column", gap: "8px" }}>
                    {abastecimentos.map(a => (
                      <div key={a.id} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                          <strong style={{ fontSize: "13px", color: "#dc2626" }}>{fmtBRL(a.valor_total)}</strong>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: "12px", color: "#475569" }}>
                          <span>Posto: {a.posto ?? "—"}</span>
                          <span>KM: {a.km_no_abast?.toLocaleString("pt-BR") ?? "—"}</span>
                          <span>Litros: {a.litros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L</span>
                          <span style={{ color: a.confirmado ? "#16a34a" : "#94a3b8", fontWeight: 600 }}>{a.confirmado ? "Confirmado" : "Pendente"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "10px", textAlign: "right", fontSize: "13px", color: "#475569" }}>
                    Total em abastecimentos:{" "}
                    <strong style={{ color: "#dc2626" }}>
                      {fmtBRL(abastecimentos.reduce((s, a) => s + a.valor_total, 0))}
                    </strong>
                  </div>
                </>
              )}
            </FormSection>
          </div>

        </div>
      </div>
    </div>
  );
}

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
  origem: string | null; destino: string | null;
  valor_frete: number | null; km_inicial: number | null; km_final: number | null;
  tipo_carga: string | null; peso_carga_kg: number | null;
  data_coleta_prevista: string | null; data_entrega_prevista: string | null;
  forma_pagamento: string | null; observacoes: string | null;
  pago: boolean | null; data_pagamento: string | null;
  comissao_motorista_valor: number | null; observacoes_financeiras: string | null;
  created_at: string | null;
  veiculos: { placa: string; modelo: string; marca: string } | null;
  motoristas: { nome: string; tipo_comissao: string } | null;
  clientes: { nome_fantasia: string } | null;
};

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

export default function FreteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [frete, setFrete] = useState<Detalhe | null>(null);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [freteRes, abastRes] = await Promise.all([
        supabase
          .from("fretes")
          .select("id,status,origem,destino,valor_frete,km_inicial,km_final,tipo_carga,peso_carga_kg,data_coleta_prevista,data_entrega_prevista,forma_pagamento,observacoes,pago,data_pagamento,comissao_motorista_valor,observacoes_financeiras,created_at,veiculos(placa,modelo,marca),motoristas(nome,tipo_comissao),clientes(nome_fantasia)")
          .eq("id", id)
          .single(),
        supabase
          .from("abastecimentos")
          .select("id,km_no_abast,litros,valor_litro,valor_total,posto,confirmado,created_at")
          .eq("frete_id", id)
          .order("created_at", { ascending: true }),
      ]);
      setFrete(freteRes.data);
      setAbastecimentos(abastRes.data ?? []);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (!frete) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Frete não encontrado.
    </div>
  );

  const veiculo   = Array.isArray(frete.veiculos)   ? frete.veiculos[0]   : frete.veiculos;
  const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
  const cliente   = Array.isArray(frete.clientes)   ? frete.clientes[0]   : frete.clientes;

  const kmRodado = frete.km_final != null && frete.km_inicial != null
    ? frete.km_final - frete.km_inicial : null;

  const margem = frete.valor_frete && frete.comissao_motorista_valor != null
    ? ((frete.valor_frete - frete.comissao_motorista_valor) / frete.valor_frete * 100)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`${frete.origem ?? "—"} → ${frete.destino ?? "—"}`}
        subtitle={`Criado em ${frete.created_at ? new Date(frete.created_at).toLocaleDateString("pt-BR") : "—"}`}
        actions={
          <>
            <Btn href="/fretes" variant="ghost">← Voltar</Btn>
            <Btn href={`/fretes/${id}/editar`} variant="outline">Editar</Btn>
          </>
        }
      >
        <Badge variant={STATUS_VAR[frete.status] ?? "default"}>
          {STATUS_LABEL[frete.status] ?? frete.status}
        </Badge>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "900px" }}>

          <FormSection title="Rota e Datas">
            <Row label="Origem"            value={frete.origem ?? "—"} />
            <Row label="Destino"           value={frete.destino ?? "—"} />
            <Row label="Coleta Prevista"   value={fmtDate(frete.data_coleta_prevista)} />
            <Row label="Entrega Prevista"  value={fmtDate(frete.data_entrega_prevista)} />
            <Row label="KM Inicial"        value={frete.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
            <Row label="KM Final"          value={frete.km_final?.toLocaleString("pt-BR") ?? "—"} />
            {kmRodado != null && (
              <Row label="KM Rodados" value={`${kmRodado.toLocaleString("pt-BR")} km`} highlight />
            )}
          </FormSection>

          <FormSection title="Veículo, Motorista e Cliente">
            <Row label="Veículo"    value={veiculo ? `${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}` : "—"} />
            <Row label="Motorista"  value={motorista?.nome ?? "—"} />
            <Row label="Comissão"   value={motorista?.tipo_comissao?.replace(/_/g, " ") ?? "—"} />
            <Row label="Cliente"    value={cliente?.nome_fantasia ?? "Sem cliente"} />
          </FormSection>

          <FormSection title="Carga">
            <Row label="Tipo de Carga" value={frete.tipo_carga ?? "—"} />
            <Row label="Peso"          value={frete.peso_carga_kg != null ? `${frete.peso_carga_kg.toLocaleString("pt-BR")} kg` : "—"} />
          </FormSection>

          <FormSection title="Financeiro">
            <Row label="Valor do Frete"    value={fmtBRL(frete.valor_frete)} highlight />
            <Row label="Comissão Motorista" value={fmtBRL(frete.comissao_motorista_valor)} />
            {margem != null && (
              <Row label="Margem Estimada" value={`${margem.toFixed(1)}%`} highlight={margem >= 0} />
            )}
            <Row label="Forma de Pagamento" value={PGTO_LABEL[frete.forma_pagamento ?? ""] ?? frete.forma_pagamento ?? "—"} />
            <Row label="Pagamento"
              value={
                frete.pago
                  ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Pago {frete.data_pagamento ? `em ${fmtDate(frete.data_pagamento)}` : ""}</span>
                  : <span style={{ color: "#eab308", fontWeight: 600 }}>Pendente</span>
              }
            />
            {frete.observacoes_financeiras && (
              <Row label="Obs. Financeiras" value={frete.observacoes_financeiras} />
            )}
          </FormSection>

          {frete.observacoes && (
            <div style={{ gridColumn: "span 2" }}>
              <FormSection title="Observações Gerais">
                <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{frete.observacoes}</p>
              </FormSection>
            </div>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <FormSection title={`Abastecimentos Vinculados (${abastecimentos.length})`}>
              {abastecimentos.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhum abastecimento vinculado a este frete.</p>
              ) : (
                <>
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

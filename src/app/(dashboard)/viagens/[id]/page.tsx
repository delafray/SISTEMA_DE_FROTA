"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, Btn, Badge,
  DataTable, Th, Td, Tr,
} from "@/components/ui/ds";

type Viagem = {
  id: string;
  status: string;
  data_saida_prevista: string | null;
  data_chegada_prevista: string | null;
  data_saida_real: string | null;
  data_chegada_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  created_at: string | null;
  motoristas: { id: string; nome: string } | null;
  veiculos: { id: string; placa: string; marca: string; modelo: string } | null;
};

type FreteViagem = {
  id: string;
  origem: string | null;
  destino: string | null;
  status: string;
  data_coleta_prevista: string | null;
  valor_frete: number | null;
  clientes: { nome_fantasia: string } | null;
};

type ResultadoFinanceiro = {
  receita: number;
  custo_combustivel: number;
  custo_despesas: number;
  custo_comissao: number;
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
const FRETE_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const FRETE_STATUS_LABEL: Record<string, string> = {
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

export default function ViagemDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [viagem, setViagem]   = useState<Viagem | null>(null);
  const [fretes, setFretes]   = useState<FreteViagem[]>([]);
  const [resultado, setResultado] = useState<ResultadoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [viagemRes, fretesRes] = await Promise.all([
        supabase.from("viagens")
          .select("id,status,data_saida_prevista,data_chegada_prevista,data_saida_real,data_chegada_real,km_inicial,km_final,observacoes,created_at,motoristas(id,nome),veiculos(id,placa,marca,modelo)")
          .eq("id", id)
          .single(),
        supabase.from("fretes")
          .select("id,origem,destino,status,data_coleta_prevista,valor_frete,clientes(nome_fantasia)")
          .eq("viagem_id", id)
          .order("data_coleta_prevista", { ascending: true }),
      ]);
      setViagem(viagemRes.data);
      const fretesList = fretesRes.data ?? [];
      setFretes(fretesList);

      // Carrega resultado financeiro consolidado da view fretes_com_resultado
      if (fretesList.length > 0) {
        const freteIds = fretesList.map(f => f.id);
        const { data: resultados } = await supabase
          .from("fretes_com_resultado")
          .select("receita,custo_combustivel,custo_despesas,custo_comissao,custo_total,lucro_bruto,margem_pct")
          .in("id", freteIds);
        if (resultados && resultados.length > 0) {
          const soma: ResultadoFinanceiro = {
            receita:          resultados.reduce((s, r) => s + (r.receita ?? 0), 0),
            custo_combustivel: resultados.reduce((s, r) => s + (r.custo_combustivel ?? 0), 0),
            custo_despesas:   resultados.reduce((s, r) => s + (r.custo_despesas ?? 0), 0),
            custo_comissao:   resultados.reduce((s, r) => s + (r.custo_comissao ?? 0), 0),
            custo_total:      resultados.reduce((s, r) => s + (r.custo_total ?? 0), 0),
            lucro_bruto:      resultados.reduce((s, r) => s + (r.lucro_bruto ?? 0), 0),
            margem_pct:       null,
          };
          soma.margem_pct = soma.receita > 0 ? (soma.lucro_bruto / soma.receita) * 100 : null;
          setResultado(soma);
        }
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
    if (novoStatus === "em_andamento") extra.data_saida_real  = new Date().toISOString();
    if (novoStatus === "concluida")    extra.data_chegada_real = new Date().toISOString();
    await supabase.from("viagens").update({ status: novoStatus, ...extra }).eq("id", id);
    setViagem(p => p ? { ...p, status: novoStatus, ...extra } : p);
    setUpdatingStatus(false);
  };

  const desvincularFrete = async (freteId: string) => {
    const supabase = createClient();
    await supabase.from("fretes").update({ viagem_id: null }).eq("id", freteId);
    setFretes(p => p.filter(f => f.id !== freteId));
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (!viagem) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Viagem não encontrada.
    </div>
  );

  const motorista = Array.isArray(viagem.motoristas) ? viagem.motoristas[0] : viagem.motoristas;
  const veiculo   = Array.isArray(viagem.veiculos)   ? viagem.veiculos[0]   : viagem.veiculos;
  const kmRodado  = viagem.km_final != null && viagem.km_inicial != null ? viagem.km_final - viagem.km_inicial : null;
  const totalFretes = fretes.reduce((s, f) => s + (f.valor_frete ?? 0), 0);

  const nextStatus =
    viagem.status === "agendada"     ? "em_andamento" :
    viagem.status === "em_andamento" ? "concluida"    : null;

  const nextLabel =
    viagem.status === "agendada"     ? "Iniciar Viagem" :
    viagem.status === "em_andamento" ? "Concluir Viagem" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Viagem — ${motorista?.nome ?? "—"}`}
        subtitle={`Criada em ${fmtDT(viagem.created_at)}`}
        actions={
          <>
            <Btn href="/viagens" variant="ghost">← Voltar</Btn>
            {nextStatus && (
              <Btn
                variant="primary"
                disabled={updatingStatus}
                onClick={() => changeStatus(nextStatus)}
              >
                {updatingStatus ? "..." : nextLabel}
              </Btn>
            )}
            {viagem.status !== "cancelada" && viagem.status !== "concluida" && (
              <Btn variant="danger" disabled={updatingStatus} onClick={() => changeStatus("cancelada")}>
                Cancelar
              </Btn>
            )}
            <Btn href={`/viagens/${id}/editar`} variant="outline">Editar</Btn>
          </>
        }
      >
        <Badge variant={STATUS_VAR[viagem.status] ?? "default"}>
          {STATUS_LABEL[viagem.status] ?? viagem.status}
        </Badge>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "900px" }}>

          <FormSection title="Motorista e Veículo">
            <Row label="Motorista" value={<strong>{motorista?.nome ?? "—"}</strong>} />
            <Row label="Veículo"   value={veiculo ? `${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}` : "—"} />
          </FormSection>

          <FormSection title="Datas">
            <Row label="Saída Prevista"   value={fmtDate(viagem.data_saida_prevista)} />
            <Row label="Chegada Prevista" value={fmtDate(viagem.data_chegada_prevista)} />
            <Row label="Saída Real"       value={fmtDT(viagem.data_saida_real)} />
            <Row label="Chegada Real"     value={fmtDT(viagem.data_chegada_real)} />
          </FormSection>

          <FormSection title="Quilometragem">
            <Row label="KM Inicial" value={viagem.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
            <Row label="KM Final"   value={viagem.km_final?.toLocaleString("pt-BR") ?? "—"} />
            {kmRodado != null && (
              <Row label="KM Rodados" value={<strong style={{ color: "#2563eb" }}>{kmRodado.toLocaleString("pt-BR")} km</strong>} />
            )}
          </FormSection>

          <FormSection title="💰 Resultado Financeiro">
            <Row label="Fretes nesta viagem" value={<Badge variant="info">{fretes.length}</Badge>} />
            <Row label="Faturamento Bruto" value={<strong style={{ color: "#16a34a" }}>{fmtBRL(totalFretes)}</strong>} />

            {resultado && resultado.custo_total > 0 && (
              <>
                <div style={{ height: "1px", background: "#f1f5f9", margin: "6px 0" }} />
                {resultado.custo_combustivel > 0 && (
                  <Row label="(-) Combustível" value={<span style={{ color: "#dc2626" }}>- {fmtBRL(resultado.custo_combustivel)}</span>} />
                )}
                {resultado.custo_despesas > 0 && (
                  <Row label="(-) Despesas (pedágio, alim.)" value={<span style={{ color: "#dc2626" }}>- {fmtBRL(resultado.custo_despesas)}</span>} />
                )}
                {resultado.custo_comissao > 0 && (
                  <Row label="(-) Comissão Motorista" value={<span style={{ color: "#dc2626" }}>- {fmtBRL(resultado.custo_comissao)}</span>} />
                )}
                <div style={{ height: "1px", background: "#e2e8f0", margin: "6px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>💵 Lucro Líquido</span>
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
              </>
            )}

            {resultado && resultado.custo_total === 0 && fretes.some(f => f.status === "concluido") && (
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px", marginBottom: 0 }}>
                📌 Nenhuma despesa registrada. O motorista pode lançar combustível e pedágios via WhatsApp.
              </p>
            )}

            {!resultado && fretes.length > 0 && (
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px", marginBottom: 0 }}>
                O resultado financeiro detalhado aparece após as despesas serem registradas.
              </p>
            )}
          </FormSection>

          {viagem.observacoes && (
            <div style={{ gridColumn: "span 2" }}>
              <FormSection title="Observações">
                <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{viagem.observacoes}</p>
              </FormSection>
            </div>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <FormSection title={`Fretes desta Viagem (${fretes.length})`}>
              {fretes.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhum frete vinculado.</p>
                  <Btn href={`/viagens/${id}/editar`} variant="outline" size="xs">Adicionar Fretes</Btn>
                </div>
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Rota</Th>
                      <Th>Cliente</Th>
                      <Th>Coleta Prevista</Th>
                      <Th>Status</Th>
                      <Th>Valor</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fretes.map(fr => {
                      const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                      return (
                        <Tr key={fr.id}>
                          <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                          <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                          <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                          <Td>
                            <Badge variant={FRETE_STATUS_VAR[fr.status] ?? "default"}>
                              {FRETE_STATUS_LABEL[fr.status] ?? fr.status}
                            </Badge>
                          </Td>
                          <Td style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(fr.valor_frete)}</Td>
                          <Td>
                            <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                              <Btn href={`/fretes/${fr.id}`} variant="ghost" size="xs">Ver</Btn>
                              <button
                                onClick={() => desvincularFrete(fr.id)}
                                style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                                title="Remover da viagem"
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

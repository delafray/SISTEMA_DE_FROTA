"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, Btn, Badge, Alert,
  DataTable, Th, Td, Tr,
} from "@/components/ui/ds";
import { MapaRota, type MapaRotaProps } from "@/components/MapaRota";

// Parada como o MapaRota consome (subset). Reusa o tipo do componente pra nao
// divergir do snapshot `endereco` jsonb que ele renderiza.
type ParadaMapa = MapaRotaProps["paradas"][number];

type Pedido = {
  id: string;
  empresa_id: string | null;
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
  veiculos: { id: string; placa: string; apelido: string | null; marca: string; modelo: string } | null;
};

type EntregaPedido = {
  id: string;
  origem: string | null;
  destino: string | null;
  status: string;
  sequencia: number | null;
  geocode_status: string | null;
  data_coleta_prevista: string | null;
  nome_cliente_avulso: string | null;
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
  agendada: "Agendado", agendado: "Agendado",
  em_andamento: "Em Andamento",
  concluida: "Concluído", concluido: "Concluído",
  cancelada: "Cancelado", cancelado: "Cancelado",
};
const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", agendado: "warning",
  em_andamento: "info",
  concluida: "success", concluido: "success",
  cancelada: "danger", cancelado: "danger",
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

function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}

/** Cliente do pedido — vem das entregas (cadastrado ou avulso), igual à lista. */
function clienteDoPedido(entregas: EntregaPedido[]): string {
  for (const e of entregas) {
    const cli = one(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

/** "Apelido (PLACA)" quando tem apelido; senão "PLACA — marca modelo". */
const veiculoLabel = (v: { placa: string; apelido: string | null; marca: string; modelo: string }) =>
  v.apelido?.trim() ? `${v.apelido} (${v.placa})` : `${v.placa} — ${v.marca} ${v.modelo}`;

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
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [entregas, setEntregas] = useState<EntregaPedido[]>([]);
  const [resultado, setResultado] = useState<ResultadoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Roteirizacao (Passo 3)
  const [paradas, setParadas] = useState<ParadaMapa[]>([]);
  const [roteirizando, setRoteirizando] = useState(false);
  const [rotaMsg, setRotaMsg] = useState<{ tipo: "success" | "error" | "info"; texto: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [pedidoRes, entregasRes, paradasRes] = await Promise.all([
        supabase.from("pedidos")
          .select("id,empresa_id,status,data_inicio_prevista,data_fim_prevista,data_inicio_real,data_fim_real,km_inicial,km_final,observacoes,created_at,valor_pedido,pago,forma_pagamento,data_pagamento,motoristas(id,nome),veiculos(id,placa,apelido,marca,modelo)")
          .eq("id", id)
          .single(),
        supabase.from("entregas")
          .select("id,origem,destino,status,sequencia,geocode_status,data_coleta_prevista,nome_cliente_avulso,clientes(nome_fantasia)")
          .eq("pedido_id", id)
          .order("sequencia", { ascending: true, nullsFirst: false })
          .order("data_coleta_prevista", { ascending: true }),
        // Paradas ja roteirizadas (se houver) — pra desenhar o mapa ao abrir.
        supabase.from("paradas")
          .select("id,ordem,latitude,longitude,endereco,fixada,concluida_em")
          .eq("pedido_id", id)
          .order("ordem", { ascending: true }),
      ]);
      const pedidoData = pedidoRes.data as unknown as Pedido | null;
      setPedido(pedidoData);
      setEntregas((entregasRes.data ?? []) as unknown as EntregaPedido[]);
      setParadas((paradasRes.data ?? []) as unknown as ParadaMapa[]);

      // Carrega resultado financeiro: receita do pedido + custos via veiculos_resultado_periodo
      if (pedidoData) {
        const receita = pedidoData.valor_pedido ?? 0;
        let custo_combustivel = 0;
        let custo_despesas = 0;

        const veiculoId = one(pedidoData.veiculos)?.id;
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

  const recarregarRota = async () => {
    if (!pedido) return;
    const supabase = createClient();
    const [paradasRes, entregasRes] = await Promise.all([
      supabase.from("paradas")
        .select("id,ordem,latitude,longitude,endereco,fixada,concluida_em")
        .eq("pedido_id", pedido.id).order("ordem", { ascending: true }),
      supabase.from("entregas")
        .select("id,origem,destino,status,sequencia,geocode_status,data_coleta_prevista,nome_cliente_avulso,clientes(nome_fantasia)")
        .eq("pedido_id", pedido.id)
        .order("sequencia", { ascending: true, nullsFirst: false })
        .order("data_coleta_prevista", { ascending: true }),
    ]);
    setParadas((paradasRes.data ?? []) as unknown as ParadaMapa[]);
    setEntregas((entregasRes.data ?? []) as unknown as EntregaPedido[]);
  };

  const roteirizar = async () => {
    if (!pedido) return;
    const mot = one(pedido.motoristas);
    if (!mot?.id || !pedido.empresa_id) {
      setRotaMsg({ tipo: "error", texto: "Pedido ainda não foi despachado — despache primeiro para roteirizar." });
      return;
    }
    if (entregas.length === 0) {
      setRotaMsg({ tipo: "error", texto: "Pedido sem entregas pra roteirizar." });
      return;
    }
    setRoteirizando(true);
    setRotaMsg({ tipo: "info", texto: "Geocodificando os destinos e otimizando a rota… (pode levar alguns segundos)" });
    try {
      const res = await fetch("/api/routing/otimizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // origem omitida de proposito: o servidor usa o deposito (endereco da empresa).
        body: JSON.stringify({ motorista_id: mot.id, empresa_id: pedido.empresa_id, pedido_id: pedido.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        const motivo = json?.motivo ? ` (${json.motivo})` : "";
        const dica = json?.error === "otimizacao_falhou"
          ? " — verifique se o VROOM_URL está configurado."
          : json?.error === "todas_geocoding_falharam"
          ? " — nenhum destino pôde ser geocodificado (endereços muito vagos?)."
          : "";
        setRotaMsg({ tipo: "error", texto: `Falha ao roteirizar: ${json?.error ?? res.status}${motivo}${dica}` });
        return;
      }
      await recarregarRota();
      const naoAtend = Array.isArray(json?.nao_atendidas) ? json.nao_atendidas.length : 0;
      const nParadas = Array.isArray(json?.paradas) ? json.paradas.length : 0;
      const km = typeof json?.distancia_total_km === "number" ? json.distancia_total_km.toFixed(1) : "?";
      setRotaMsg(
        naoAtend > 0
          ? { tipo: "info", texto: `Rota gerada com ${nParadas} parada(s). ${naoAtend} entrega(s) ficaram de fora (endereço não geocodificado).` }
          : { tipo: "success", texto: `✓ Rota otimizada: ${nParadas} parada(s), ${km} km.` }
      );
    } catch (e) {
      setRotaMsg({ tipo: "error", texto: `Erro de rede ao roteirizar: ${(e as Error).message}` });
    } finally {
      setRoteirizando(false);
    }
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

  const motorista = one(pedido.motoristas);
  const veiculo   = one(pedido.veiculos);
  const despachado = !!veiculo || !!motorista;
  const finalizado = pedido.status === "cancelada" || pedido.status === "cancelado"
                  || pedido.status === "concluida" || pedido.status === "concluido";
  const cliente   = clienteDoPedido(entregas);
  const kmRodado  = pedido.km_final != null && pedido.km_inicial != null ? pedido.km_final - pedido.km_inicial : null;

  // Iniciar/Concluir só fazem sentido DEPOIS do despacho (fluxo Pedido → Despacho → Execução).
  const nextStatus = !despachado ? null :
    (pedido.status === "agendada" || pedido.status === "agendado") ? "em_andamento" :
    pedido.status === "em_andamento"                               ? "concluida"    : null;

  const nextLabel =
    nextStatus === "em_andamento" ? "Iniciar Pedido" :
    nextStatus === "concluida"    ? "Concluir Pedido" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Pedido — ${cliente}`}
        subtitle={`Criado em ${fmtDT(pedido.created_at)}`}
        actions={
          <>
            <Btn href="/pedidos" variant="ghost">← Voltar</Btn>
            {!despachado && !finalizado && (
              <Btn href="/despacho" variant="primary">🚚 Despachar</Btn>
            )}
            {nextStatus && (
              <Btn
                variant="primary"
                disabled={updatingStatus}
                onClick={() => changeStatus(nextStatus)}
              >
                {updatingStatus ? "..." : nextLabel}
              </Btn>
            )}
            {!finalizado && (
              <Btn
                variant="danger"
                disabled={updatingStatus}
                onClick={() => { if (window.confirm("Cancelar este pedido?")) changeStatus("cancelada"); }}
              >
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

          <FormSection title="📦 Pedido">
            <Row label="Cliente" value={<strong>{cliente}</strong>} />
            <Row label="Valor" value={<strong style={{ color: "#16a34a" }}>{fmtBRL(pedido.valor_pedido)}</strong>} />
            <Row label="Pagamento" value={pedido.pago
              ? <span style={{ color: "#16a34a" }}>✓ Pago {pedido.data_pagamento ? `em ${fmtDate(pedido.data_pagamento)}` : ""}</span>
              : <span style={{ color: "#eab308" }}>Pendente</span>}
            />
            <Row label="Entregas" value={<Badge variant="info">{entregas.length}</Badge>} />
            <Row label="Início Previsto" value={fmtDate(pedido.data_inicio_prevista)} />
            <Row label="Fim Previsto"    value={fmtDate(pedido.data_fim_prevista)} />
          </FormSection>

          <FormSection title="🚚 Despacho e Execução">
            {!despachado ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "8px 0" }}>
                <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                  Este pedido ainda <strong>não foi despachado</strong> — sem caminhão e motorista definidos.
                </p>
                {!finalizado && <Btn href="/despacho" variant="outline" size="sm">Ir para o Despacho →</Btn>}
              </div>
            ) : (
              <>
                <Row label="Motorista" value={<strong>{motorista?.nome ?? "—"}</strong>} />
                <Row label="Caminhão"  value={veiculo ? veiculoLabel(veiculo) : "—"} />
                <Row label="KM Inicial" value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
                <Row label="KM Final"   value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
                {kmRodado != null && (
                  <Row label="KM Rodados" value={<strong style={{ color: "#2563eb" }}>{kmRodado.toLocaleString("pt-BR")} km</strong>} />
                )}
                <Row label="Início Real" value={fmtDT(pedido.data_inicio_real)} />
                <Row label="Fim Real"    value={fmtDT(pedido.data_fim_real)} />
              </>
            )}
            <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "8px", marginBottom: 0 }}>
              Caminhão, motorista e KM são definidos na tela de <a href="/despacho" style={{ color: "#2563eb" }}>Despacho</a> e no fluxo do motorista.
            </p>
          </FormSection>

          <FormSection title="💰 Resultado Financeiro">
            <Row label="Receita do Pedido" value={<strong style={{ color: "#16a34a" }}>{fmtBRL(pedido.valor_pedido)}</strong>} />

            {resultado && resultado.custo_total > 0 && (
              <>
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
                {despachado
                  ? "📌 Nenhuma despesa registrada no mês para este veículo."
                  : "📌 Os custos aparecem depois do despacho (são consolidados por caminhão)."}
              </p>
            )}
          </FormSection>

          {pedido.observacoes && (
            <FormSection title="Observações">
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
            </FormSection>
          )}

          <div style={{ gridColumn: "span 2" }}>
            <FormSection title="🗺️ Rota Otimizada">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                <Btn
                  variant="primary"
                  disabled={roteirizando || entregas.length === 0 || !despachado}
                  onClick={roteirizar}
                >
                  {roteirizando ? "Roteirizando…" : paradas.length > 0 ? "🔄 Re-roteirizar" : "🧭 Roteirizar"}
                </Btn>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {entregas.length === 0
                    ? "Adicione entregas ao pedido para roteirizar."
                    : !despachado
                    ? "Despache o pedido primeiro — a rota é calculada para o motorista."
                    : "Parte do depósito (endereço da empresa) e ordena os destinos das entregas."}
                </span>
              </div>

              {rotaMsg && (
                <div style={{ marginBottom: "12px" }}>
                  <Alert variant={rotaMsg.tipo === "success" ? "success" : rotaMsg.tipo === "error" ? "error" : "info"}>
                    {rotaMsg.texto}
                  </Alert>
                </div>
              )}

              {paradas.length > 0 ? (
                <MapaRota paradas={paradas} altura={380} />
              ) : (
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                  Nenhuma rota gerada ainda. Clique em <strong>Roteirizar</strong> para calcular a ordem ótima das entregas.
                </p>
              )}
            </FormSection>
          </div>

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
                      const cli = one(fr.clientes);
                      return (
                        <Tr key={fr.id}>
                          <Td style={{ fontWeight: 600 }}>
                            {fr.sequencia != null && (
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                minWidth: "20px", height: "20px", marginRight: "8px", padding: "0 5px",
                                borderRadius: "10px", background: "#2563eb", color: "#fff",
                                fontSize: "11px", fontWeight: 700,
                              }}>{fr.sequencia}</span>
                            )}
                            {fr.origem ?? "—"} → {fr.destino ?? "—"}
                            {fr.geocode_status === "falhou" && (
                              <span title="Destino não pôde ser geocodificado — ficou fora da rota" style={{ marginLeft: "6px", fontSize: "11px", color: "#dc2626" }}>⚠ sem coordenada</span>
                            )}
                          </Td>
                          <Td>{cli?.nome_fantasia ?? fr.nome_cliente_avulso?.trim() ?? "—"}</Td>
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

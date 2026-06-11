"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import {
  PageHeader, FormField, inputStyle, selectStyle,
  Btn, Alert, DataTable, Th, Td, Tr, EmptyState,
} from "@/components/ui/ds";
import { format } from "date-fns";

type Motorista = { id: string; nome: string };
type Veiculo   = { id: string; placa: string; marca: string; modelo: string; km_atual: number | null };
type EntregaDisp = {
  id: string;
  origem: string | null;
  destino: string | null;
  data_coleta_prevista: string | null;
  data_entrega_prevista: string | null;
  status: string;
  clientes: { nome_fantasia: string } | null;
};

type StatusVeiculo = "disponivel" | "em_pedido" | "em_manutencao";
type InfoVeiculo = {
  status: StatusVeiculo;
  detalhe: string | null;
};

const fmtDate = (d: string | null) => d ? format(new Date(d + "T00:00:00"), "dd/MM/yyyy") : "—";

const STATUS_BADGE: Record<StatusVeiculo, { icon: string; label: string; cor: string; bg: string }> = {
  disponivel:     { icon: "🟢", label: "Disponível",      cor: "#166534", bg: "#dcfce7" },
  em_pedido:      { icon: "🔴", label: "Em Pedido",       cor: "#991b1b", bg: "#fee2e2" },
  em_manutencao:  { icon: "🟠", label: "Em Manutenção",   cor: "#92400e", bg: "#fef3c7" },
};

export default function NovoPedidoAvancadoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [entregasDisp, setEntregasDisp] = useState<EntregaDisp[]>([]);
  const [statusVeiculos, setStatusVeiculos] = useState<Record<string, InfoVeiculo>>({});

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Form State
  const [motoristaId, setMotoristaId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [veiculoPadrao, setVeiculoPadrao] = useState<Veiculo | null>(null);
  const [veiculoWarning, setVeiculoWarning] = useState<{ tipo: "error" | "warning"; msg: string } | null>(null);
  const [checkingVeiculo, setCheckingVeiculo] = useState(false);
  const [selectedEntregas, setSelectedEntregas] = useState<Set<string>>(new Set());

  const [f, setF] = useState({
    status: "agendada",
    data_inicio_prevista: "",
    km_inicial: "",
    valor_pedido: "",
    observacoes: "",
    local_carregamento: "",
  });

  // Carrega status de todos os veículos em paralelo (pedido ativo + manutenção ativa)
  const carregarStatusVeiculos = async (veicIds: string[], _empId: string) => {
    const [pedRes, manutRes] = await Promise.all([
      supabase.from("pedidos")
        .select("veiculo_id, motoristas(nome)")
        .in("veiculo_id", veicIds)
        .eq("status", "em_andamento"),
      supabase.from("manutencoes")
        .select("veiculo_id, tipos_manutencao(nome)")
        .in("veiculo_id", veicIds)
        .in("status", ["planejada", "pendente", "aprovada", "em_execucao"])
        .is("data_realizada", null),
    ]);

    const mapa: Record<string, InfoVeiculo> = {};

    // Marcar veículos em pedido
    for (const v of (pedRes.data ?? [])) {
      if (!v.veiculo_id) continue;
      const nomeMot = (Array.isArray(v.motoristas) ? v.motoristas[0] : v.motoristas)?.nome ?? "motorista";
      mapa[v.veiculo_id] = { status: "em_pedido", detalhe: `Em rota com ${nomeMot}` };
    }

    // Marcar veículos em manutenção (só se ainda não está em pedido)
    for (const m of (manutRes.data ?? [])) {
      if (!m.veiculo_id) continue;
      if (!mapa[m.veiculo_id]) {
        const tipoNome = (Array.isArray(m.tipos_manutencao) ? m.tipos_manutencao[0] : m.tipos_manutencao)?.nome ?? "manutenção";
        mapa[m.veiculo_id] = { status: "em_manutencao", detalhe: tipoNome };
      }
    }

    // Todos os outros são disponíveis
    for (const id of veicIds) {
      if (!mapa[id]) mapa[id] = { status: "disponivel", detalhe: null };
    }

    setStatusVeiculos(mapa);
  };

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      // Disponibilidade COMPARTILHADA entre os sócios → todos os motoristas/veículos/entregas pendentes.
      const [motRes, veicRes, entRes] = await Promise.all([
        supabase.from("motoristas").select("id,nome").eq("ativo", true).order("nome"),
        supabase.from("veiculos").select("id,placa,marca,modelo,km_atual").eq("ativo", true).order("placa"),
        supabase.from("entregas")
          .select("id,origem,destino,data_coleta_prevista,data_entrega_prevista,status,clientes(nome_fantasia)")
          .is("pedido_id", null)
          .in("status", ["agendado"])
          .order("data_coleta_prevista", { ascending: true }),
      ]);

      const veicsList = veicRes.data ?? [];
      setMotoristas(motRes.data ?? []);
      setVeiculos(veicsList);
      setEntregasDisp((entRes.data ?? []) as unknown as EntregaDisp[]);

      // Carrega o status operacional de todos os veículos de uma vez
      if (veicsList.length > 0) {
        await carregarStatusVeiculos(veicsList.map(v => v.id), "");
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Workflow Handlers

  const handleMotoristaNext = async () => {
    if (!motoristaId) { setErr("Selecione um motorista primeiro."); return; }
    setErr("");
    setCheckingVeiculo(true);

    const { data: mv } = await supabase.from("alocacoes")
      .select("veiculo_id")
      .eq("motorista_id", motoristaId)
      .eq("status", "operacional")
      .is("fim", null)
      .maybeSingle();

    if (mv?.veiculo_id) {
      setVeiculoId(mv.veiculo_id);
      const vp = veiculos.find(v => v.id === mv.veiculo_id);
      setVeiculoPadrao(vp || null);
      verificarStatusVeiculo(mv.veiculo_id);
    } else {
      setVeiculoId("");
      setVeiculoPadrao(null);
      setVeiculoWarning(null);
    }

    setCheckingVeiculo(false);
    setStep(2);
  };

  const verificarStatusVeiculo = (vId: string) => {
    if (!vId) { setVeiculoWarning(null); return; }
    const info = statusVeiculos[vId];
    if (!info) { setVeiculoWarning(null); return; }

    if (info.status === "em_manutencao") {
      setVeiculoWarning({
        tipo: "error",
        msg: `🔧 Este caminhão está em manutenção${info.detalhe ? ` (${info.detalhe})` : ""}. Conclua ou cancele a manutenção antes de colocá-lo em pedido.`,
      });
    } else if (info.status === "em_pedido") {
      setVeiculoWarning({
        tipo: "warning",
        msg: `⚠️ Atenção: ${info.detalhe ?? "Este caminhão já está em um pedido ativo"}. Verifique antes de prosseguir.`,
      });
    } else {
      setVeiculoWarning(null);
    }
  };

  const handleVeiculoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vId = e.target.value;
    setVeiculoId(vId);
    if (vId) verificarStatusVeiculo(vId);
    else setVeiculoWarning(null);
  };

  const toggleEntrega = (id: string) => {
    setSelectedEntregas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleEntregasNext = () => {
    if (selectedEntregas.size === 0) {
      const confirmEmpty = window.confirm("Você não selecionou nenhuma entrega. Deseja criar um pedido vazio?");
      if (!confirmEmpty) return;
    }
    setErr("");
    setStep(3);
  };

  // Generate Itinerary
  const itinerario = useMemo(() => {
    const stops: { entrega_id: string; tipo: string; local: string | null; data: string | null; cliente: string | undefined }[] = [];
    const selected = entregasDisp.filter(fr => selectedEntregas.has(fr.id));

    selected.forEach(fr => {
      if (fr.origem) {
        stops.push({
          entrega_id: fr.id,
          tipo: "Coleta",
          local: fr.origem,
          data: fr.data_coleta_prevista,
          cliente: Array.isArray(fr.clientes) ? fr.clientes[0]?.nome_fantasia : fr.clientes?.nome_fantasia,
        });
      }
      if (fr.destino) {
        stops.push({
          entrega_id: fr.id,
          tipo: "Entrega",
          local: fr.destino,
          data: fr.data_entrega_prevista,
          cliente: Array.isArray(fr.clientes) ? fr.clientes[0]?.nome_fantasia : fr.clientes?.nome_fantasia,
        });
      }
    });

    stops.sort((a, b) => {
      if (!a.data && !b.data) return 0;
      if (!a.data) return 1;
      if (!b.data) return -1;
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

    return stops;
  }, [entregasDisp, selectedEntregas]);

  const veiculoEmManutencao = veiculoId && statusVeiculos[veiculoId]?.status === "em_manutencao";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (!veiculoId) {
      setErr("Por favor, selecione um veículo para o pedido.");
      return;
    }

    if (veiculoEmManutencao) {
      setErr("Não é possível criar o pedido: o veículo selecionado está em manutenção ativa. Conclua ou cancele a manutenção primeiro.");
      return;
    }

    setSaving(true);

    // Frete HERDA a empresa do CAMINHÃO usado (o CNPJ dono do veículo fatura o frete).
    const empresa_id = await empresaDoVeiculo(supabase, veiculoId);
    if (!empresa_id) { setSaving(false); setErr("Caminhão sem empresa definida"); return; }
    const empresa_motorista_id = await empresaDoMotorista(supabase, motoristaId); // foto: detecta "emprestado"

        const { data: pedido, error } = await supabase.from("pedidos").insert({
      empresa_id,
      empresa_motorista_id,
      motorista_id:          motoristaId,
      veiculo_id:            veiculoId,
      status:                f.status,
      data_inicio_prevista:  f.data_inicio_prevista || null,
      km_inicial:            f.km_inicial ? parseFloat(f.km_inicial) : null,
      valor_pedido:          f.valor_pedido ? parseFloat(f.valor_pedido) : null,
      observacoes:           f.observacoes || null,
      local_carregamento:    f.local_carregamento || null,
    }).select("id").single();

    if (error || !pedido) {
      const msgErr = error?.message?.includes("VEICULO_EM_MANUTENCAO")
        ? "Não é possível criar o pedido: o veículo selecionado possui manutenção ativa. Conclua ou cancele a manutenção primeiro."
        : (error?.message ?? "Erro ao criar pedido");
      setErr(msgErr);
      setSaving(false);
      return;
    }

    // Vincular entregas selecionadas
    if (selectedEntregas.size > 0) {
      await supabase.from("entregas")
        .update({
          pedido_id:    pedido.id,
          motorista_id: motoristaId,
          veiculo_id:   veiculoId,
        })
        .in("id", Array.from(selectedEntregas));
    }

    router.push(`/pedidos/${pedido.id}`);
    router.refresh();
  };

  const setFVal = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f1f5f9" }}>
      <PageHeader
        title="Planejar Novo Pedido (Modo Avançado)"
        actions={<Btn href="/pedidos" variant="outline">Voltar para Lista</Btn>}
      />

      <div style={{ flex: 1, padding: "24px", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>

        {/* PROGRESS BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "32px", position: "relative" }}>
          <div style={{ position: "absolute", top: "12px", left: "0", right: "0", height: "2px", background: "#cbd5e1", zIndex: 0 }}></div>
          {[
            { s: 1, label: "1. Motorista" },
            { s: 2, label: "2. Entregas" },
            { s: 3, label: "3. Veículo e Resumo" }
          ].map(item => {
            const active = step >= item.s;
            const current = step === item.s;
            return (
              <div key={item.s} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, background: "#f1f5f9", padding: "0 16px" }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "12px",
                  background: active ? "#2563eb" : "#e2e8f0",
                  color: active ? "#fff" : "#94a3b8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "bold", fontSize: "12px",
                  boxShadow: current ? "0 0 0 4px rgba(37,99,235,0.2)" : "none"
                }}>
                  {item.s}
                </div>
                <span style={{ fontSize: "13px", marginTop: "8px", color: active ? "#1e293b" : "#94a3b8", fontWeight: current ? 600 : 400 }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">{err}</Alert></div>}

        <div style={{ background: "#fff", padding: "32px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>

          {/* STEP 1: MOTORISTA */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px", color: "#1e293b" }}>Quem é o motorista?</h2>
              <p style={{ color: "#64748b", marginBottom: "24px", fontSize: "14px" }}>Selecione o motorista responsável por este pedido.</p>

              <FormField label="Motorista Selecionado">
                <select value={motoristaId} onChange={e => setMotoristaId(e.target.value)} style={{ ...selectStyle, fontSize: "16px", padding: "12px" }}>
                  <option value="">Selecione na lista...</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </FormField>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "32px" }}>
                <Btn type="button" variant="primary" onClick={handleMotoristaNext} disabled={checkingVeiculo}>
                  Avançar para Entregas →
                </Btn>
              </div>
            </div>
          )}

          {/* STEP 2: ENTREGAS */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px", color: "#1e293b" }}>Quais entregas ele vai realizar?</h2>
              <p style={{ color: "#64748b", marginBottom: "24px", fontSize: "14px" }}>Selecione as entregas agendadas para compor este pedido.</p>

              {entregasDisp.length === 0 ? (
                <EmptyState icon="📭" message='Nenhuma entrega com status "Agendado" sem pedido atrelado foi encontrada.' />
              ) : (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                  <DataTable count={entregasDisp.length} label="entregas disponíveis">
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <Th style={{ width: "32px", textAlign: "center" }}>✓</Th>
                        <Th>Rota</Th>
                        <Th>Cliente</Th>
                        <Th>Coleta (Data)</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregasDisp.map(fr => {
                        const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                        const checked = selectedEntregas.has(fr.id);
                        return (
                          <Tr key={fr.id}
                            style={{ cursor: "pointer", background: checked ? "#eff6ff" : "#fff" }}
                            onClick={() => toggleEntrega(fr.id)}
                          >
                            <Td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEntrega(fr.id)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: "18px", height: "18px", accentColor: "#2563eb", cursor: "pointer" }}
                              />
                            </Td>
                            <Td style={{ fontWeight: checked ? 600 : 400, color: checked ? "#1e40af" : "inherit" }}>
                              {fr.origem?.split("-")[0] ?? "—"} → {fr.destino?.split("-")[0] ?? "—"}
                            </Td>
                            <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                            <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px" }}>
                <Btn type="button" variant="ghost" onClick={() => setStep(1)}>← Voltar</Btn>
                <Btn type="button" variant="primary" onClick={handleEntregasNext}>
                  Avançar para Veículo e Resumo →
                </Btn>
              </div>
            </div>
          )}

          {/* STEP 3: VEICULO E RESUMO */}
          {step === 3 && (
            <form
              onSubmit={handleSubmit}
              // Enter num input não envia o formulário — só o botão de salvar.
              onKeyDown={e => {
                if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px", color: "#1e293b" }}>Veículo e Detalhes do Pedido</h2>
              <p style={{ color: "#64748b", marginBottom: "24px", fontSize: "14px" }}>
                Confira o veículo e o roteiro gerado automaticamente.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>

                {/* Lado Esquerdo: Veículo e Roteiro */}
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                  {/* Legenda de cores */}
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "10px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    {Object.entries(STATUS_BADGE).map(([key, b]) => (
                      <span key={key} style={{ fontSize: "11px", color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                        {b.icon} {b.label}
                      </span>
                    ))}
                  </div>

                  {/* Veículo Seleção */}
                  <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 16px 0", color: "#334155" }}>Veículo do Pedido</h3>

                    {veiculoPadrao ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Veículo Fixo Atribuído</div>
                            <div style={{ fontSize: "16px", fontWeight: 600, color: "#1e293b", marginTop: "4px" }}>
                              {veiculoPadrao.placa} — {veiculoPadrao.marca} {veiculoPadrao.modelo}
                            </div>
                            {statusVeiculos[veiculoPadrao.id] && (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                fontSize: "11px", fontWeight: 600, marginTop: "6px",
                                padding: "2px 8px", borderRadius: "9999px",
                                background: STATUS_BADGE[statusVeiculos[veiculoPadrao.id].status].bg,
                                color: STATUS_BADGE[statusVeiculos[veiculoPadrao.id].status].cor,
                              }}>
                                {STATUS_BADGE[statusVeiculos[veiculoPadrao.id].status].icon}{" "}
                                {STATUS_BADGE[statusVeiculos[veiculoPadrao.id].status].label}
                                {statusVeiculos[veiculoPadrao.id].detalhe && ` — ${statusVeiculos[veiculoPadrao.id].detalhe}`}
                              </span>
                            )}
                          </div>
                          <button type="button" onClick={() => { setVeiculoPadrao(null); setVeiculoId(""); setVeiculoWarning(null); }} style={{ fontSize: "13px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                            Trocar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <FormField label="Selecione um Veículo">
                        <select value={veiculoId} onChange={handleVeiculoChange} style={{ ...selectStyle, fontSize: "14px" }}>
                          <option value="">Selecione...</option>
                          {veiculos.map(v => {
                            const info = statusVeiculos[v.id];
                            const badge = info ? STATUS_BADGE[info.status] : STATUS_BADGE["disponivel"];
                            const disabled = info?.status === "em_manutencao";
                            return (
                              <option key={v.id} value={v.id} disabled={disabled}>
                                {badge.icon} {v.placa} — {v.marca} {v.modelo}
                                {info?.status === "em_manutencao" ? " (EM MANUTENÇÃO)" :
                                  info?.status === "em_pedido" ? " (EM PEDIDO)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </FormField>
                    )}

                    {/* Aviso de status do veículo */}
                    {veiculoWarning && veiculoId && (
                      <div style={{
                        marginTop: "16px", padding: "12px",
                        background: veiculoWarning.tipo === "error" ? "#fef2f2" : "#fffbeb",
                        borderLeft: `4px solid ${veiculoWarning.tipo === "error" ? "#ef4444" : "#f59e0b"}`,
                        borderRadius: "0 4px 4px 0",
                      }}>
                        <p style={{
                          color: veiculoWarning.tipo === "error" ? "#7f1d1d" : "#78350f",
                          margin: 0, fontSize: "13px", fontWeight: 500,
                        }}>
                          {veiculoWarning.msg}
                        </p>
                        {veiculoWarning.tipo === "error" && (
                          <p style={{ color: "#991b1b", fontSize: "11px", marginTop: "6px", marginBottom: 0 }}>
                            A criação do pedido será bloqueada enquanto a manutenção estiver ativa.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Itinerário */}
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "#334155" }}>Roteiro (Paradas)</h3>
                    {itinerario.length === 0 ? (
                      <p style={{ color: "#94a3b8", fontSize: "14px", fontStyle: "italic" }}>Pedido sem entregas selecionadas.</p>
                    ) : (
                      <div style={{ position: "relative", paddingLeft: "16px", borderLeft: "2px solid #e2e8f0" }}>
                        {itinerario.map((stop, i) => (
                          <div key={i} style={{ marginBottom: "20px", position: "relative" }}>
                            <div style={{
                              position: "absolute", left: "-23px", top: "4px", width: "14px", height: "14px",
                              borderRadius: "7px", background: stop.tipo === "Coleta" ? "#3b82f6" : "#22c55e",
                              border: "3px solid #fff"
                            }}></div>
                            <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "14px" }}>
                              {stop.tipo} em {stop.local?.split("-")[0] || "N/A"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                              {stop.cliente ? `Para: ${stop.cliente}` : ""}
                              {stop.data ? ` • Prev: ${fmtDate(stop.data)}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lado Direito: Formulário Dados Pedido */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0, color: "#334155" }}>Dados do Pedido</h3>

                  <FormField label="Status do Pedido">
                    <select value={f.status} onChange={setFVal("status")} style={selectStyle}>
                      <option value="agendada">Agendada (Planejamento)</option>
                      <option value="em_andamento">Em Andamento (Saiu p/ pedido)</option>
                    </select>
                  </FormField>

                  <FormField label="Data Prevista de Início">
                    <input type="date" value={f.data_inicio_prevista} onChange={setFVal("data_inicio_prevista")} style={inputStyle} />
                  </FormField>

                  <FormField label="Valor do Pedido (R$)">
                    {/* Máscara de moeda — defaultValue (não-controlado, senão trava a
                        digitação); preserva o valor ao voltar de outro passo do wizard. */}
                    <IMaskInput mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true, padFractionalZeros: true } }}
                      defaultValue={f.valor_pedido}
                      onAccept={(_, m) => setF(p => ({ ...p, valor_pedido: String(m.unmaskedValue) }))}
                      style={inputStyle} placeholder="R$ 0,00" />
                  </FormField>

                  <FormField label="KM Inicial do Veículo">
                    <input
                      type="number"
                      value={f.km_inicial}
                      onChange={setFVal("km_inicial")}
                      placeholder={veiculos.find(v => v.id === veiculoId)?.km_atual != null ? String(veiculos.find(v => v.id === veiculoId)?.km_atual) : "Ex: 125000"}
                      style={inputStyle}
                    />
                  </FormField>

                  <FormField label="Local de Carregamento">
                    <input
                      type="text"
                      value={f.local_carregamento}
                      onChange={setFVal("local_carregamento")}
                      placeholder="Ex: Galpão Central, Rua X, 123 - Cidade/UF"
                      style={inputStyle}
                    />
                  </FormField>

                  <FormField label="Observações">
                    <textarea
                      value={f.observacoes}
                      onChange={setFVal("observacoes")}
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical" }}
                      placeholder="Informações gerais do pedido..."
                    />
                  </FormField>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
                <Btn type="button" variant="ghost" onClick={() => setStep(2)}>← Voltar</Btn>
                <Btn
                  type="submit"
                  variant="primary"
                  disabled={saving || !!veiculoEmManutencao}
                  style={{ padding: "0 32px", fontSize: "16px" }}
                >
                  {saving ? "Gerando Pedido..." : "Confirmar e Criar Pedido ✓"}
                </Btn>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { obterSessaoComFallback } from "@/lib/offline/authOffline";
import { limparSessaoLocal } from "@/lib/offline/sessao";
import { limparRotasAtivas } from "@/lib/offline/rotaCache";

type PedidoCard = {
  id: string;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  observacoes: string | null;
  valor_pedido: number | null;
  veiculos: { placa: string; modelo: string; marca: string } | null;
  entregas: {
    id: string;
    origem: string | null;
    destino: string | null;
    status: string;
    clientes: { nome_fantasia: string } | null;
  }[];
};

type Adiantamento = {
  id: string;
  tipo: string | null;
  valor: number | null;
  status: string;
  created_at: string | null;
  justificativa: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada", em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  agendada:     { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  em_andamento: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
  concluida:    { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  cancelada:    { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};
const ENTREGA_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};
const ADT_STATUS_LABEL: Record<string, string> = {
  solicitado: "Solicitado", aprovado: "Aprovado", recusado: "Recusado", pago: "Pago", prestado: "Prestação Entregue",
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function MotoristaPage() {
  const router = useRouter();
  const [nome, setNome]             = useState("");
  const [pedidos, setPedidos]       = useState<PedidoCard[]>([]);
  const [adiantamentos,   setAdiantamentos]   = useState<Adiantamento[]>([]);
  const [abastecimentos,  setAbastecimentos]  = useState<{ id: string; posto: string | null; litros: number; valor_total: number; km_no_abast: number | null; confirmado: boolean | null; created_at: string | null }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"viagens" | "adiantamentos" | "abastecimentos">("viagens");
  const [signingOut, setSigningOut] = useState(false);
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [empresaId,   setEmpresaIdState] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      // Auth com fallback offline: online valida no Supabase e salva o perfil
      // local; offline (sem rede) usa o perfil salvo (valido por 7 dias).
      const auth = await obterSessaoComFallback(supabase);
      if (!auth.ok || !auth.sessao) {
        if (auth.motivo === "role_negado") { router.push("/"); return; }
        router.push("/login");
        return;
      }

      const { motorista_id: mId, empresa_id: eId, nome: nomeUsr } = auth.sessao;
      if (nomeUsr) setNome(nomeUsr);
      setMotoristaId(mId);
      setEmpresaIdState(eId);

      if (auth.origem === "offline_cache") {
        // Sem rede: nao da pra buscar pedidos/adiantamentos/abastecimentos do
        // servidor. Mantemos o motorista LOGADO e habilitamos a "Rota do dia"
        // (que opera offline via cache local).
        setOffline(true);
        setLoading(false);
        return;
      }

      if (!mId) { setLoading(false); return; }

      const [pedidosRes, adtRes, abastRes] = await Promise.all([
        supabase.from("pedidos")
          .select("id,status,data_inicio_prevista,data_fim_prevista,observacoes,valor_pedido,veiculos(placa,modelo,marca),entregas(id,origem,destino,status,clientes(nome_fantasia))")
          .eq("motorista_id", mId)
          .order("data_inicio_prevista", { ascending: false })
          .limit(30),
        supabase.from("adiantamentos")
          .select("id,tipo,valor,status,created_at,justificativa")
          .eq("motorista_id", mId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("abastecimentos")
          .select("id,posto,litros,valor_total,km_no_abast,confirmado,created_at")
          .eq("motorista_id", mId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      setPedidos((pedidosRes.data ?? []) as unknown as PedidoCard[]);
      setAdiantamentos(adtRes.data ?? []);
      setAbastecimentos(abastRes.data ?? []);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    // Corta o acesso offline: apaga a sessao local e o cache de rota antes de sair.
    await limparSessaoLocal();
    await limparRotasAtivas();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const iniciarPedido = async (pedidoId: string) => {
    const supabase = createClient();
    await supabase.from("pedidos").update({
      status: "em_andamento",
      data_inicio_real: new Date().toISOString(),
    }).eq("id", pedidoId);
    setPedidos(p => p.map(v => v.id === pedidoId ? { ...v, status: "em_andamento" } : v));
  };

  const concluirPedido = async (pedidoId: string) => {
    const supabase = createClient();
    await supabase.from("pedidos").update({
      status: "concluida",
      data_fim_real: new Date().toISOString(),
    }).eq("id", pedidoId);
    setPedidos(p => p.map(v => v.id === pedidoId ? { ...v, status: "concluida" } : v));
  };

  const semVinculo = !loading && motoristaId === null;
  const ativas   = pedidos.filter(v => v.status === "em_andamento" || v.status === "agendada");
  const concluidas = pedidos.filter(v => v.status === "concluida");
  const totalReceita = pedidos
    .filter(v => v.status === "concluida")
    .reduce((s, p) => s + (p.valor_pedido ?? 0), 0);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b", flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "32px" }}>🚚</div>
      <div style={{ fontSize: "14px" }}>Carregando...</div>
    </div>
  );

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "0 0 32px 0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#313f50", padding: "20px 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            App Motorista
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: "2px 0 0", lineHeight: 1.2 }}>
            Olá, {nome.split(" ")[0] || "Motorista"}
          </h1>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ background: "rgba(239,68,68,0.15)", border: "none", color: "rgba(252,165,165,0.9)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: signingOut ? "default" : "pointer" }}
        >
          {signingOut ? "..." : "Sair"}
        </button>
      </div>

      {offline && (
        <div
          data-testid="banner-offline"
          style={{ background: "#78350f", color: "#fde68a", padding: "10px 16px", fontSize: "13px", fontWeight: 600, textAlign: "center" }}
        >
          📴 Modo offline — sem internet. Seus pedidos podem estar desatualizados, mas a Rota do dia funciona normalmente.
        </div>
      )}

      {/* KPI strip */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 16px", display: "flex" }}>
        {[
          { label: "Pedidos Ativos",  value: ativas.length,    color: "#2563eb" },
          { label: "Concluídos",      value: concluidas.length, color: "#16a34a" },
          { label: "Receita Total",   value: fmtBRL(totalReceita), color: "#7c3aed" },
        ].map((k, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? "1px solid #e2e8f0" : "none" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, marginTop: "3px", textTransform: "uppercase" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Rota do dia ─────────────────────────────────────────── */}
      <div style={{ padding: "12px 12px 0" }}>
        {motoristaId && empresaId ? (
          <a
            href={`/mobile/rota?motorista_id=${motoristaId}&empresa_id=${empresaId}`}
            data-testid="btn-rota-do-dia"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              borderRadius: "14px",
              padding: "16px 18px",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(22,163,74,0.35)",
              transition: "transform 120ms, box-shadow 120ms",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 6px 20px rgba(22,163,74,0.45)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = ""; (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 14px rgba(22,163,74,0.35)"; }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
                Rota do dia
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "2px" }}>
                Ver rota ativa ou criar nova
              </div>
            </div>
            <div style={{ fontSize: "22px", color: "rgba(255,255,255,0.7)" }}>›</div>
          </a>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "#f1f5f9",
              borderRadius: "14px",
              padding: "16px 18px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#334155" }}>Rota do dia</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Conta sem vínculo de motorista — solicite ao gestor
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        {([["viagens", "Pedidos"], ["abastecimentos", "Abastecimentos"], ["adiantamentos", "Adiantamentos"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: "12px", border: "none", background: "none",
            fontSize: "14px", fontWeight: tab === key ? 700 : 500,
            color: tab === key ? "#2563eb" : "#64748b",
            borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
      </div>

      {semVinculo && (
        <div style={{ margin: "20px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "16px", color: "#92400e", fontSize: "13px", lineHeight: 1.6 }}>
          <strong>Conta não vinculada</strong><br />
          Seu usuário ainda não foi associado a um motorista cadastrado no sistema.<br />
          Solicite ao gestor que preencha a coluna <strong>motorista_id</strong> na tabela <strong>perfis</strong>.
        </div>
      )}

      <div style={{ padding: "12px" }}>

        {tab === "viagens" && (
          pedidos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px", color: "#94a3b8" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚛</div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>Nenhum pedido atribuído</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pedidos.map(v => {
                const s = STATUS_COLOR[v.status] ?? { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
                const veiculo = Array.isArray(v.veiculos) ? v.veiculos[0] : v.veiculos;
                const entregas  = Array.isArray(v.entregas)  ? v.entregas       : [];
                return (
                  <div key={v.id} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

                    {/* Cabeçalho do pedido */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>
                          {STATUS_LABEL[v.status] ?? v.status}
                        </span>
                        {veiculo && (
                          <span style={{ marginLeft: "8px", fontSize: "12px", color: "#64748b" }}>
                            {veiculo.placa} · {veiculo.marca} {veiculo.modelo}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {fmtDate(v.data_inicio_prevista)}
                        {v.data_fim_prevista ? ` → ${fmtDate(v.data_fim_prevista)}` : ""}
                      </span>
                    </div>

                    {/* Entregas do pedido */}
                    {entregas.length > 0 && (
                      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "6px" }}>
                          {entregas.length} {entregas.length === 1 ? "Entrega" : "Entregas"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {entregas.map(f => {
                            const cliente = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
                            return (
                              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                                <span style={{ color: "#334155", fontWeight: 500 }}>
                                  {f.origem ?? "—"} → {f.destino ?? "—"}
                                  {cliente && <span style={{ color: "#94a3b8", fontWeight: 400 }}> · {cliente.nome_fantasia}</span>}
                                </span>
                                <span style={{ fontSize: "11px", color: "#64748b" }}>
                                  {ENTREGA_STATUS_LABEL[f.status] ?? f.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Rodapé: valor + ações */}
                    <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#166534" }}>
                        {fmtBRL(v.valor_pedido)}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {v.status === "agendada" && (
                          <button
                            onClick={() => iniciarPedido(v.id)}
                            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Iniciar
                          </button>
                        )}
                        {v.status === "em_andamento" && (
                          <button
                            onClick={() => concluirPedido(v.id)}
                            style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Concluir
                          </button>
                        )}
                        <Link href={`/motorista/pedidos/${v.id}`} style={{ background: "#f1f5f9", color: "#475569", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                          Detalhes
                        </Link>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "abastecimentos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link
              href="/motorista/abastecimentos/novo"
              style={{ display: "block", background: "#f59e0b", color: "#fff", borderRadius: "12px", padding: "14px", textAlign: "center", fontSize: "15px", fontWeight: 700, textDecoration: "none" }}
            >
              ⛽ Registrar Novo Abastecimento
            </Link>
            {abastecimentos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>⛽</div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>Nenhum abastecimento registrado</div>
              </div>
            ) : abastecimentos.map(a => (
              <div key={a.id} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#dc2626" }}>
                      {a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {a.litros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L
                      {a.km_no_abast != null && ` · ${a.km_no_abast.toLocaleString("pt-BR")} km`}
                    </div>
                  </div>
                  <span style={{
                    background: a.confirmado ? "#dcfce7" : "#fef9c3",
                    color:      a.confirmado ? "#166534" : "#854d0e",
                    borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 700,
                  }}>
                    {a.confirmado ? "Confirmado" : "Pendente"}
                  </span>
                </div>
                {a.posto && <div style={{ fontSize: "13px", color: "#475569" }}>{a.posto}</div>}
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  {a.created_at ? new Date(a.created_at).toLocaleString("pt-BR") : "—"}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "adiantamentos" && (
          adiantamentos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px", color: "#94a3b8" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>💰</div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>Nenhum adiantamento encontrado</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {adiantamentos.map(a => (
                <div key={a.id} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "16px", color: "#166534" }}>{fmtBRL(a.valor)}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        {a.tipo?.replace(/_/g, " ")} · {fmtDate(a.created_at?.slice(0, 10) ?? null)}
                      </div>
                    </div>
                    <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 700 }}>
                      {ADT_STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                  {a.justificativa && (
                    <div style={{ fontSize: "12px", color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                      {a.justificativa}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

      </div>
    </div>
  );
}

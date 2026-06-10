import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, KpiCard } from "@/components/ui/ds";
import { LembretesWidget } from "@/components/dashboard/LembretesWidget";
import { rotuloPedido } from "@/lib/utils/numeroPedido";

export const dynamic = "force-dynamic";

type PedidoRecente = {
  id: string; numero: string | null; status: string;
  valor_pedido: number | null; created_at: string;
  data_inicio_prevista: string | null; data_fim_prevista: string | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; modelo: string } | null;
};

type StatusFrota = {
  veiculo_id: string;
  placa: string;
  modelo: string;
  status_pedido: string | null;
  motorista_atual_id: string | null;
};

type Alerta = { tipo: "danger" | "warning"; msg: string; href: string };

const STATUS_VAR: Record<string, string> = {
  agendado: "#854d0e", agendada: "#854d0e",
  em_andamento: "#1e40af",
  concluido: "#166534", concluida: "#166534",
  cancelado: "#991b1b", cancelada: "#991b1b",
};
const STATUS_BG: Record<string, string> = {
  agendado: "#fef9c3", agendada: "#fef9c3",
  em_andamento: "#dbeafe",
  concluido: "#dcfce7", concluida: "#dcfce7",
  cancelado: "#fee2e2", cancelada: "#fee2e2",
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", agendada: "Agendado",
  em_andamento: "Em Andamento",
  concluido: "Concluído", concluida: "Concluído",
  cancelado: "Cancelado", cancelada: "Cancelado",
};

const alertaBg:     Record<string, string> = { danger: "#fef2f2", warning: "#fffbeb" };
const alertaBorder: Record<string, string> = { danger: "#fecaca", warning: "#fde68a" };
const alertaColor:  Record<string, string> = { danger: "#991b1b", warning: "#92400e" };
const alertaIcon:   Record<string, string> = { danger: "🚫",      warning: "⚠️" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: ue } = await supabase
    .from("usuario_empresas").select("empresa_id,role")
    .eq("usuario_id", user.id).eq("is_padrao", true).single();

  if (ue?.role === "motorista") return redirect("/motorista");

  const empresaId = ue?.empresa_id ?? "";

  const now       = new Date();
  const hoje      = now.toISOString().slice(0, 10);
  const em30dias  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10);
  const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const mesFim    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    { count: totalPedidos },
    { count: pedidosAndamento },
    { count: pedidosAgendados },
    { count: veiculosAtivos },
    { data: pedidosMes },
    { count: motoristasAtivos },
    { data: cnhVencidas },
    { data: cnhVencendo },
    { data: docVencidos },
    { data: docVencendo },
    { count: adtPendentes },
    { data: pedidosRecentes },
    { data: manutProximas },
    { data: statusFrota },
  ] = await Promise.all([
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "em_andamento"),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId).in("status", ["agendado", "agendada"]),
    supabase.from("veiculos").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("pedidos").select("valor_pedido").eq("empresa_id", empresaId).in("status", ["concluido", "concluida"])
      .gte("updated_at", mesInicio).lte("updated_at", mesFim),
    supabase.from("motoristas").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("motoristas").select("id,nome,cnh_validade").eq("empresa_id", empresaId).eq("ativo", true)
      .lt("cnh_validade", hoje),
    supabase.from("motoristas").select("id,nome,cnh_validade").eq("empresa_id", empresaId).eq("ativo", true)
      .gte("cnh_validade", hoje).lte("cnh_validade", em30dias),
    supabase.from("veiculos").select("id,placa,apelido,ipva_vencimento,licenciamento_vencimento,seguro_vencimento")
      .eq("empresa_id", empresaId).eq("ativo", true)
      .or(`ipva_vencimento.lt.${hoje},licenciamento_vencimento.lt.${hoje},seguro_vencimento.lt.${hoje}`),
    supabase.from("veiculos").select("id,placa,apelido,ipva_vencimento,licenciamento_vencimento,seguro_vencimento")
      .eq("empresa_id", empresaId).eq("ativo", true)
      .or(`ipva_vencimento.gte.${hoje},licenciamento_vencimento.gte.${hoje},seguro_vencimento.gte.${hoje}`)
      .or(`ipva_vencimento.lte.${em30dias},licenciamento_vencimento.lte.${em30dias},seguro_vencimento.lte.${em30dias}`),
    supabase.from("adiantamentos").select("*", { count: "exact", head: true })
      .eq("empresa_id", empresaId).eq("status", "solicitado"),
    supabase.from("pedidos")
      .select("id,numero,status,valor_pedido,created_at,data_inicio_prevista,data_fim_prevista,motoristas(nome),veiculos(placa,modelo)")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("proxima_manutencao_veiculo")
      .select("veiculo_id,placa,tipo_nome,criticidade,data_proxima,km_proxima,km_faltando,status")
      .eq("empresa_id", empresaId),
    supabase.from("status_operacional_veiculos")
      .select("veiculo_id,placa,modelo,status_pedido,motorista_atual_id")
      .eq("empresa_id", empresaId)
      .order("placa"),
  ]);

  const receitaMes = (pedidosMes ?? []).reduce((s, p) => s + (p.valor_pedido ?? 0), 0);
  const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
  const diasAte = (d: string) => Math.ceil((new Date(d + "T00:00:00").getTime() - now.getTime()) / 86400000);

  const alertas: Alerta[] = [
    ...(cnhVencidas ?? []).map(m => ({
      tipo: "danger" as const,
      msg: `CNH vencida: ${m.nome} (${fmtDate(m.cnh_validade)})`,
      href: `/motoristas/${m.id}/editar`,
    })),
    ...(cnhVencendo ?? []).map(m => {
      const dias = diasAte(m.cnh_validade);
      return {
        tipo: "warning" as const,
        msg: `CNH vence em ${dias} dia${dias !== 1 ? "s" : ""}: ${m.nome} (${fmtDate(m.cnh_validade)})`,
        href: `/motoristas/${m.id}/editar`,
      };
    }),
  ];

  const DOC_LABEL: Record<string, string> = {
    ipva_vencimento: "IPVA",
    licenciamento_vencimento: "Licenciamento",
    seguro_vencimento: "Seguro",
  };
  const docCols = ["ipva_vencimento", "licenciamento_vencimento", "seguro_vencimento"] as const;

  for (const v of docVencidos ?? []) {
    const nome = v.apelido ?? v.placa;
    for (const col of docCols) {
      const val = v[col];
      if (val && val < hoje) {
        alertas.push({ tipo: "danger", msg: `${DOC_LABEL[col]} vencido: ${nome} (${fmtDate(val)})`, href: `/veiculos/${v.id}/editar` });
      }
    }
  }
  for (const v of docVencendo ?? []) {
    const nome = v.apelido ?? v.placa;
    for (const col of docCols) {
      const val = v[col];
      if (val && val >= hoje && val <= em30dias) {
        const dias = diasAte(val);
        alertas.push({ tipo: "warning", msg: `${DOC_LABEL[col]} vence em ${dias} dia${dias !== 1 ? "s" : ""}: ${nome} (${fmtDate(val)})`, href: `/veiculos/${v.id}/editar` });
      }
    }
  }

  for (const m of manutProximas ?? []) {
    if (!m.veiculo_id) continue;
    const venceEmDias = m.data_proxima ? diasAte(m.data_proxima) : null;
    const kmFalt = m.km_faltando;
    const vencidoKm = kmFalt != null && kmFalt < 0;
    const vencidoData = venceEmDias != null && venceEmDias < 0;
    const proximoKm = kmFalt != null && kmFalt >= 0 && kmFalt <= 2000;
    const proximoData = venceEmDias != null && venceEmDias >= 0 && venceEmDias <= 30;

    if (!vencidoKm && !vencidoData && !proximoKm && !proximoData) continue;

    const tipo = vencidoKm || vencidoData ? "danger" : "warning";
    let msg = `${tipo === "danger" ? "Manutenção vencida" : "Manutenção próxima"}: ${m.tipo_nome} — ${m.placa}`;
    if (vencidoKm) msg += ` (${Math.abs(kmFalt!).toLocaleString("pt-BR")} km atrasada)`;
    else if (proximoKm) msg += ` (faltam ${kmFalt!.toLocaleString("pt-BR")} km)`;
    else if (vencidoData) msg += ` (vencida há ${Math.abs(venceEmDias!)} dia${Math.abs(venceEmDias!) !== 1 ? "s" : ""})`;
    else if (proximoData) msg += ` (vence em ${venceEmDias} dia${venceEmDias !== 1 ? "s" : ""})`;

    alertas.push({ tipo, msg, href: `/veiculos/${m.veiculo_id}/editar` });
  }

  // `numero` é coluna nova (migration_numero_pedido) — regenerar database.types.ts
  const pedidosRecentesArr = (pedidosRecentes as unknown as PedidoRecente[]) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Painel de Controle" subtitle="Visão geral do sistema" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }} className="has-bottom-nav">

        {/* ── Lembretes pendentes ──────────────────────────────── */}
        <LembretesWidget />

        {/* ── Gerar Rota — ação rápida ─────────────────────────── */}
        <Link
          href="/roteirizacao"
          data-testid="btn-gerar-rota"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            borderRadius: "14px",
            padding: "18px 20px",
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
          }}
        >
          <div style={{ fontSize: "40px", lineHeight: 1 }}>🗺️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
              Gerar Rota
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>
              Otimize entregas — selecione motorista e inicie
            </div>
          </div>
          <div style={{ fontSize: "24px", color: "rgba(255,255,255,0.65)" }}>›</div>
        </Link>

        {alertas.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {alertas.map((a, i) => (
              <Link key={i} href={a.href} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 14px",
                background: alertaBg[a.tipo], border: `1px solid ${alertaBorder[a.tipo]}`,
                borderRadius: "8px", color: alertaColor[a.tipo],
                fontSize: "13px", fontWeight: 600, textDecoration: "none",
              }}>
                <span>{alertaIcon[a.tipo]}</span>
                <span>{a.msg}</span>
                <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.7 }}>Editar →</span>
              </Link>
            ))}
          </div>
        )}

        {(statusFrota ?? []).length > 0 && (() => {
          const frota = statusFrota as unknown as StatusFrota[];
          const cfgDisponivel  = { icon: "🟢", label: "Disponível", cor: "#166534", bg: "#dcfce7", border: "#86efac" };
          const cfgEmViagem    = { icon: "🔵", label: "Em Rota",    cor: "#1e40af", bg: "#dbeafe", border: "#93c5fd" };
          return (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                🚛 Status da Frota Agora
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
                {frota.map(v => {
                  const emRota = v.status_pedido === "em_andamento";
                  const cfg = emRota ? cfgEmViagem : cfgDisponivel;
                  return (
                    <div key={v.veiculo_id} style={{
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      borderRadius: "8px",
                      padding: "10px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "14px" }}>{cfg.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: "13px", color: cfg.cor }}>{v.placa}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: cfg.cor, opacity: 0.85 }}>
                        {v.modelo}
                      </div>
                      <div style={{ fontSize: "10px", color: cfg.cor, opacity: 0.7, marginTop: "2px" }}>
                        {cfg.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="kpi-grid-3 m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          <KpiCard label="Total de Pedidos"  value={totalPedidos ?? 0}     color="info" />
          <KpiCard label="Em Andamento"      value={pedidosAndamento ?? 0} color="warning" />
          <KpiCard label="Agendados"         value={pedidosAgendados ?? 0} color="default" />
        </div>

        <div className="kpi-grid-4 m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          <KpiCard label="Veículos Ativos"       value={veiculosAtivos ?? 0}   color="success" />
          <KpiCard label="Motoristas Ativos"     value={motoristasAtivos ?? 0} color="success" />
          <KpiCard label="Receita do Mês"        value={fmtBRL(receitaMes)}    color="success" />
          <KpiCard
            label="Adiantamentos Pendentes"
            value={adtPendentes ?? 0}
            color={(adtPendentes ?? 0) > 0 ? "warning" : "default"}
            sub={(adtPendentes ?? 0) > 0 ? "aguardando aprovação" : undefined}
          />
        </div>

        {(() => {
          const ativos = pedidosRecentesArr.filter(p => p.status === "em_andamento");
          if (ativos.length === 0) return null;
          return (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                🚛 Em Rota Agora
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
                {ativos.map(p => {
                  const m = Array.isArray(p.motoristas) ? p.motoristas[0] : p.motoristas;
                  const v = Array.isArray(p.veiculos)   ? p.veiculos[0]   : p.veiculos;
                  return (
                    <Link key={p.id} href={`/pedidos/${p.id}`} style={{ textDecoration: "none" }}>
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1e40af", marginBottom: "4px" }}>
                          Pedido {rotuloPedido(p.numero, p.id)}
                        </div>
                        <div style={{ fontSize: "12px", color: "#3b82f6", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          {v && <span>🚚 {v.placa} {v.modelo}</span>}
                          {m && <span>👤 {m.nome}</span>}
                          {p.data_fim_prevista && (
                            <span>📅 Fim: {new Date(p.data_fim_prevista + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                          )}
                        </div>
                        {p.valor_pedido != null && (
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8", marginTop: "6px" }}>{fmtBRL(p.valor_pedido)}</div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {pedidosRecentesArr.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pedidos Recentes</span>
              <Link href="/pedidos" style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>Ver todos →</Link>
            </div>

            <div className="m-hide" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {pedidosRecentesArr.map(p => {
                    const m = Array.isArray(p.motoristas) ? p.motoristas[0] : p.motoristas;
                    const v = Array.isArray(p.veiculos)   ? p.veiculos[0]   : p.veiculos;
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                          Pedido {rotuloPedido(p.numero, p.id)}
                        </td>
                        <td style={{ padding: "8px 8px", fontSize: "12px", color: "#64748b" }}>{m?.nome ?? "—"}</td>
                        <td style={{ padding: "8px 8px", fontSize: "12px", color: "#64748b" }}>{v?.placa ?? "—"}</td>
                        <td style={{ padding: "8px 8px" }}>
                          <span style={{ background: STATUS_BG[p.status] ?? "#f1f5f9", color: STATUS_VAR[p.status] ?? "#475569", borderRadius: "9999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px 8px", fontSize: "12px", color: "#16a34a", fontWeight: 600, textAlign: "right" }}>
                          {p.valor_pedido != null ? fmtBRL(p.valor_pedido) : "—"}
                        </td>
                        <td style={{ padding: "8px 16px", fontSize: "11px", color: "#94a3b8", textAlign: "right" }}>
                          {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>
                          <Link href={`/pedidos/${p.id}`} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Ver</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="m-show" style={{ display: "none", flexDirection: "column", gap: "0" }}>
              {pedidosRecentesArr.map(p => {
                const m = Array.isArray(p.motoristas) ? p.motoristas[0] : p.motoristas;
                const v = Array.isArray(p.veiculos)   ? p.veiculos[0]   : p.veiculos;
                return (
                  <Link key={p.id} href={`/pedidos/${p.id}`} style={{ textDecoration: "none" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>Pedido {rotuloPedido(p.numero, p.id)}</span>
                        <span style={{ background: STATUS_BG[p.status] ?? "#f1f5f9", color: STATUS_VAR[p.status] ?? "#475569", borderRadius: "9999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                        <div style={{ display: "flex", gap: "8px", color: "#64748b", flexWrap: "wrap" }}>
                          {m && <span>👤 {m.nome}</span>}
                          {v && <span>🚚 {v.placa}</span>}
                        </div>
                        <span style={{ color: "#16a34a", fontWeight: 600, flexShrink: 0 }}>
                          {p.valor_pedido != null ? fmtBRL(p.valor_pedido) : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

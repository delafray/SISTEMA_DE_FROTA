"use client";

/**
 * 💰 Financeiro por Cliente — TELA PRINCIPAL de recebíveis (decisão do dono,
 * 10/06/2026: unificou a antiga aba "A Receber" do /financeiro aqui).
 *
 * - Pedido lançado JÁ aparece aqui (com financeiro "a definir").
 * - Agrupado POR CLIENTE: quantos pedidos, pagos, em aberto e total.
 * - Expandindo o cliente → cada pedido com o PAINEL FINANCEIRO embutido:
 *   empresa de faturamento, forma, ACRÉSCIMOS/DESCONTOS, parcelamento
 *   (1ª hoje, +30 dias cada) com reconciliação em cascata e baixa por parcela.
 * - Total a receber = valor + acréscimos - descontos (migration
 *   db/migration_pedido_acrescimos_descontos.sql; degrada sem ela).
 * - KPI "Em atraso" herdado do antigo A Receber: parcela vencida não paga ou
 *   pedido único não pago com data fim prevista passada.
 *
 * Agregação por cliente precisa de TODAS as linhas — payload mínimo via
 * loadAll até existir RPC de agregação (mesma exceção dos KPIs de soma).
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import {
  PageHeader, Btn, Badge, KpiCard, EmptyState, SearchInput,
} from "@/components/ui/ds";
import { FinanceiroPedido, type EmpresaOpcao } from "./_components/FinanceiroPedido";

type PedidoFin = {
  id: string;
  cliente_id: string | null;
  valor_pedido: number | null;
  pago: boolean | null;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  forma_pagamento: string | null;
  acrescimos?: number | null;  // migration_pedido_acrescimos_descontos
  descontos?: number | null;
};

type ParcelaFin = { pedido_id: string; valor: number; pago: boolean; vencimento: string | null };

type GrupoCliente = {
  clienteId: string | null;
  nome: string;
  pedidos: PedidoFin[];
  qtd: number;
  qtdPagos: number;
  valorTotal: number;
  valorPago: number;
  valorAberto: number;
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Total a receber do pedido (valor + acréscimos - descontos). */
const totalDe = (p: PedidoFin) =>
  Math.round(((p.valor_pedido ?? 0) + (p.acrescimos ?? 0) - (p.descontos ?? 0)) * 100) / 100;

export default function FaturamentoPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState<GrupoCliente[]>([]);
  const [parcelasPorPedido, setParcelasPorPedido] = useState<Map<string, ParcelaFin[]>>(new Map());
  const [empresaIdPadrao, setEmpresaIdPadrao] = useState<string>("");
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [valorAtrasado, setValorAtrasado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "com_pendencia" | "quitados">("com_pendencia");
  const [expandido, setExpandido] = useState<string | null>(null);
  /** pedido com o painel financeiro aberto */
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
      .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setLoading(false); return; }
    const eid = ue.empresa_id;
    setEmpresaIdPadrao(eid);

    // agregação por cliente precisa de todas as linhas; payload mínimo até existir RPC.
    // Pedidos: tenta com acréscimos/descontos (migration nova); sem ela, recarrega sem.
    const selBase = "id,cliente_id,valor_pedido,pago,status,data_inicio_prevista,data_fim_prevista,forma_pagamento";
    const buscarPedidos = (sel: string) =>
      loadAll<PedidoFin>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("pedidos")
          .select(sel)
          .eq("empresa_id", eid)
          .not("valor_pedido", "is", null)
          .gt("valor_pedido", 0)
          .not("status", "in", "(cancelada,cancelado)")
          .order("created_at", { ascending: false })
          .range(from, to)
      );

    const [pedidos, clientes, parcelas, empresasRes] = await Promise.all([
      buscarPedidos(`${selBase},acrescimos,descontos`).catch(() => buscarPedidos(selBase)),
      supabase.from("clientes").select("id,nome_fantasia,apelido").eq("empresa_id", eid),
      loadAll<ParcelaFin>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("pedido_parcelas")
          .select("pedido_id,valor,pago,vencimento")
          .eq("empresa_id", eid)
          .range(from, to)
      ).catch(() => [] as ParcelaFin[]),
      supabase.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia"),
    ]);
    setEmpresas((empresasRes.data ?? []) as EmpresaOpcao[]);

    const nomePorCliente = new Map<string, string>();
    for (const c of clientes.data ?? []) {
      nomePorCliente.set(c.id, (c as { nome_fantasia: string | null; apelido: string | null }).nome_fantasia
        ?? (c as { apelido: string | null }).apelido ?? "Cliente");
    }

    const porPedido = new Map<string, ParcelaFin[]>();
    for (const p of parcelas) {
      const lista = porPedido.get(p.pedido_id) ?? [];
      lista.push(p);
      porPedido.set(p.pedido_id, lista);
    }
    setParcelasPorPedido(porPedido);

    // valor pago de um pedido: parcelado → soma das parcelas pagas; único → tudo ou nada
    const valorPagoDe = (p: PedidoFin): number => {
      const pars = porPedido.get(p.id);
      if (pars && pars.length > 0) return pars.filter(x => x.pago).reduce((s, x) => s + (x.valor ?? 0), 0);
      return p.pago ? totalDe(p) : 0;
    };
    const estaQuitado = (p: PedidoFin): boolean => {
      const pars = porPedido.get(p.id);
      if (pars && pars.length > 0) return pars.every(x => x.pago);
      return !!p.pago;
    };

    // Em atraso: parcela vencida não paga; único não pago com fim previsto passado.
    const hoje = hojeISO();
    let atrasado = 0;
    for (const p of pedidos) {
      const pars = porPedido.get(p.id);
      if (pars && pars.length > 0) {
        atrasado += pars.filter(x => !x.pago && x.vencimento && x.vencimento < hoje)
          .reduce((s, x) => s + (x.valor ?? 0), 0);
      } else if (!p.pago && p.data_fim_prevista && p.data_fim_prevista < hoje) {
        atrasado += totalDe(p);
      }
    }
    setValorAtrasado(Math.round(atrasado * 100) / 100);

    const mapa = new Map<string, GrupoCliente>();
    for (const p of pedidos) {
      const key = p.cliente_id ?? "__avulso__";
      const nome = p.cliente_id ? (nomePorCliente.get(p.cliente_id) ?? "Cliente") : "Sem cliente / avulsos";
      const g = mapa.get(key) ?? {
        clienteId: p.cliente_id, nome, pedidos: [],
        qtd: 0, qtdPagos: 0, valorTotal: 0, valorPago: 0, valorAberto: 0,
      };
      const pagoValor = valorPagoDe(p);
      const total = totalDe(p);
      g.pedidos.push(p);
      g.qtd += 1;
      if (estaQuitado(p)) g.qtdPagos += 1;
      g.valorTotal += total;
      g.valorPago += pagoValor;
      g.valorAberto += total - pagoValor;
      mapa.set(key, g);
    }

    const lista = Array.from(mapa.values()).sort((a, b) => b.valorAberto - a.valorAberto);
    setGrupos(lista);
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  // ── baixa rápida do pagamento ÚNICO (parcelado dá baixa por parcela no painel) ──
  const baixarPedido = async (pedidoId: string) => {
    setBaixando(pedidoId);
    const supabase = createClient();
    await supabase.from("pedidos").update({
      pago: true,
      data_pagamento: hojeISO(),
    }).eq("id", pedidoId);
    await carregar();
    setBaixando(null);
  };

  // ── filtros client-side sobre os GRUPOS (a tela já carrega o agregado) ────
  const termo = normalizar(busca);
  const visiveis = grupos.filter(g => {
    if (filtro === "com_pendencia" && g.valorAberto <= 0.009) return false;
    if (filtro === "quitados" && g.valorAberto > 0.009) return false;
    if (termo && !normalizar(g.nome).includes(termo)) return false;
    return true;
  });

  const totais = grupos.reduce((acc, g) => ({
    total: acc.total + g.valorTotal,
    pago: acc.pago + g.valorPago,
    aberto: acc.aberto + g.valorAberto,
  }), { total: 0, pago: 0, aberto: 0 });

  const hoje = hojeISO();

  const situacaoPedido = (p: PedidoFin) => {
    const pars = parcelasPorPedido.get(p.id);
    if (pars && pars.length > 0) {
      const pagas = pars.filter(x => x.pago).length;
      const vencida = pars.some(x => !x.pago && x.vencimento && x.vencimento < hoje);
      if (pagas === pars.length) return <Badge variant="success">✓ {pars.length}x pagas</Badge>;
      return (
        <>
          <Badge variant="warning">{pagas}/{pars.length} parcelas</Badge>
          {vencida && <Badge variant="danger">⚠ vencida</Badge>}
        </>
      );
    }
    if (p.pago) return <Badge variant="success">✓ Pago</Badge>;
    const atrasado = p.data_fim_prevista && p.data_fim_prevista < hoje;
    const semCondicoes = !p.forma_pagamento;
    return (
      <>
        <Badge variant={atrasado ? "danger" : "warning"}>{atrasado ? "⚠ Atrasado" : "Pendente"}</Badge>
        {semCondicoes && <Badge variant="default">financeiro a definir</Badge>}
      </>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Financeiro"
        subtitle="Recebíveis por cliente — condições, parcelas e baixas"
        count={loading ? undefined : visiveis.length}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <KpiCard label="Valor Total" value={loading ? "..." : fmtBRL(totais.total)} />
          <KpiCard label="Recebido"    value={loading ? "..." : fmtBRL(totais.pago)}   color="success" />
          <KpiCard label="Em Aberto"   value={loading ? "..." : fmtBRL(totais.aberto)} color="warning" />
          <KpiCard label="Em Atraso"   value={loading ? "..." : fmtBRL(valorAtrasado)} color="danger" />
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <SearchInput placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          {([["com_pendencia", "Com pendência"], ["quitados", "Quitados"], ["todos", "Todos"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              style={{
                padding: "6px 14px", borderRadius: "16px", fontSize: "12px", fontWeight: 600,
                background: filtro === v ? "#2563eb" : "#fff",
                color: filtro === v ? "#fff" : "#475569",
                border: "1px solid #cbd5e1", cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#94a3b8", padding: "24px", textAlign: "center" }}>Carregando...</p>
        ) : visiveis.length === 0 ? (
          <EmptyState icon="💚" message={
            filtro === "com_pendencia" ? "Nenhum cliente com pendência. 🎉" : "Nenhum cliente encontrado."
          } />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {visiveis.map(g => {
              const key = g.clienteId ?? "__avulso__";
              const aberto = expandido === key;
              return (
                <div key={key} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  {/* linha do cliente */}
                  <button
                    type="button"
                    onClick={() => setExpandido(aberto ? null : key)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px", width: "100%",
                      padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#94a3b8", width: "14px" }}>{aberto ? "▾" : "▸"}</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", flex: 1 }}>{g.nome}</span>
                    <span style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {g.qtd} pedido{g.qtd !== 1 ? "s" : ""} · {g.qtdPagos} pago{g.qtdPagos !== 1 ? "s" : ""} · faltam {g.qtd - g.qtdPagos}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap", minWidth: "110px", textAlign: "right" }}>
                      {fmtBRL(g.valorTotal)}
                    </span>
                    <span style={{
                      fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", minWidth: "130px", textAlign: "right",
                      color: g.valorAberto > 0.009 ? "#d97706" : "#16a34a",
                    }}>
                      {g.valorAberto > 0.009 ? `${fmtBRL(g.valorAberto)} em aberto` : "✓ quitado"}
                    </span>
                  </button>

                  {/* pedidos do cliente */}
                  {aberto && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: "4px 16px 12px" }}>
                      {g.pedidos.map(p => {
                        const financeiroAberto = pedidoAberto === p.id;
                        const temParcelas = (parcelasPorPedido.get(p.id)?.length ?? 0) > 0;
                        return (
                          <div key={p.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <div style={{
                              display: "flex", alignItems: "center", gap: "10px",
                              padding: "8px 0", flexWrap: "wrap",
                            }}>
                              <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#64748b" }}>#{p.id.slice(0, 8)}</span>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>{fmtDate(p.data_inicio_prevista)}</span>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }} title={
                                (p.acrescimos ?? 0) > 0 || (p.descontos ?? 0) > 0
                                  ? `Valor ${fmtBRL(p.valor_pedido ?? 0)} + acréscimos ${fmtBRL(p.acrescimos ?? 0)} - descontos ${fmtBRL(p.descontos ?? 0)}`
                                  : undefined
                              }>
                                {fmtBRL(totalDe(p))}
                              </span>
                              {p.forma_pagamento && <span style={{ fontSize: "11px", color: "#94a3b8" }}>{p.forma_pagamento}</span>}
                              {situacaoPedido(p)}
                              <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                                {!temParcelas && !p.pago && (
                                  <Btn variant="outline" size="xs" disabled={baixando === p.id} onClick={() => baixarPedido(p.id)}>
                                    {baixando === p.id ? "..." : "💰 Baixar"}
                                  </Btn>
                                )}
                                <Btn
                                  variant={financeiroAberto ? "primary" : "outline"} size="xs"
                                  onClick={() => setPedidoAberto(financeiroAberto ? null : p.id)}
                                >
                                  💳 Financeiro {financeiroAberto ? "▴" : "▾"}
                                </Btn>
                                <Btn href={`/despacho/${p.id}`} variant="ghost" size="xs" title="Detalhe operacional no Despacho">🚚</Btn>
                              </span>
                            </div>
                            {financeiroAberto && (
                              <FinanceiroPedido
                                pedidoId={p.id}
                                empresaId={empresaIdPadrao}
                                valorPedido={p.valor_pedido ?? 0}
                                empresas={empresas}
                                onMudou={carregar}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * 💰 Financeiro por Cliente (decisão do dono, 10/06/2026):
 * menu abaixo do Despacho que reúne TODOS os pagamentos (pendentes e feitos)
 * AGRUPADOS POR CLIENTE. Na listagem: cliente, quantos pedidos, quantos pagos,
 * o que falta e o valor total. Expandindo o cliente: cada pedido com situação
 * (pago / pendente / X de N parcelas) e as ações — baixa rápida do pagamento
 * único aqui; parcelas e condições de faturamento se tratam DENTRO do pedido
 * (seção 💳 Pagamento do detalhe).
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

type PedidoFin = {
  id: string;
  cliente_id: string | null;
  valor_pedido: number | null;
  pago: boolean | null;
  status: string;
  data_inicio_prevista: string | null;
  forma_pagamento: string | null;
};

type ParcelaFin = { pedido_id: string; valor: number; pago: boolean };

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

export default function FaturamentoPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState<GrupoCliente[]>([]);
  const [parcelasPorPedido, setParcelasPorPedido] = useState<Map<string, ParcelaFin[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "com_pendencia" | "quitados">("com_pendencia");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push("/login"); return; }
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
      .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setLoading(false); return; }
    const eid = ue.empresa_id;

    // agregação por cliente precisa de todas as linhas; payload mínimo até existir RPC
    const [pedidos, clientes, parcelas] = await Promise.all([
      loadAll<PedidoFin>((from, to) =>
        supabase.from("pedidos")
          .select("id,cliente_id,valor_pedido,pago,status,data_inicio_prevista,forma_pagamento")
          .eq("empresa_id", eid)
          .not("valor_pedido", "is", null)
          .gt("valor_pedido", 0)
          .not("status", "in", "(cancelada,cancelado)")
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      supabase.from("clientes").select("id,nome_fantasia,apelido").eq("empresa_id", eid),
      // tabela nova (migration_pedido_faturamento_parcelas); regenerar database.types.ts
      loadAll<ParcelaFin>((from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("pedido_parcelas")
          .select("pedido_id,valor,pago")
          .eq("empresa_id", eid)
          .range(from, to)
      ).catch(() => [] as ParcelaFin[]), // tabela pode não existir antes da migration
    ]);

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
      return p.pago ? (p.valor_pedido ?? 0) : 0;
    };
    const estaQuitado = (p: PedidoFin): boolean => {
      const pars = porPedido.get(p.id);
      if (pars && pars.length > 0) return pars.every(x => x.pago);
      return !!p.pago;
    };

    const mapa = new Map<string, GrupoCliente>();
    for (const p of pedidos) {
      const key = p.cliente_id ?? "__avulso__";
      const nome = p.cliente_id ? (nomePorCliente.get(p.cliente_id) ?? "Cliente") : "Sem cliente / avulsos";
      const g = mapa.get(key) ?? {
        clienteId: p.cliente_id, nome, pedidos: [],
        qtd: 0, qtdPagos: 0, valorTotal: 0, valorPago: 0, valorAberto: 0,
      };
      const pagoValor = valorPagoDe(p);
      g.pedidos.push(p);
      g.qtd += 1;
      if (estaQuitado(p)) g.qtdPagos += 1;
      g.valorTotal += p.valor_pedido ?? 0;
      g.valorPago += pagoValor;
      g.valorAberto += (p.valor_pedido ?? 0) - pagoValor;
      mapa.set(key, g);
    }

    const lista = Array.from(mapa.values()).sort((a, b) => b.valorAberto - a.valorAberto);
    setGrupos(lista);
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  // ── baixa rápida do pagamento ÚNICO (parcelado se trata no pedido) ─────────
  const baixarPedido = async (pedidoId: string) => {
    setBaixando(pedidoId);
    const supabase = createClient();
    await supabase.from("pedidos").update({
      pago: true,
      data_pagamento: new Date().toISOString().slice(0, 10),
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

  const situacaoPedido = (p: PedidoFin) => {
    const pars = parcelasPorPedido.get(p.id);
    if (pars && pars.length > 0) {
      const pagas = pars.filter(x => x.pago).length;
      return pagas === pars.length
        ? <Badge variant="success">✓ {pars.length}x pagas</Badge>
        : <Badge variant="warning">{pagas}/{pars.length} parcelas</Badge>;
    }
    return p.pago
      ? <Badge variant="success">✓ Pago</Badge>
      : <Badge variant="warning">Pendente</Badge>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Financeiro"
        subtitle="Pagamentos por cliente — pendentes e realizados"
        count={loading ? undefined : visiveis.length}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          <KpiCard label="Valor Total"   value={loading ? "..." : fmtBRL(totais.total)} />
          <KpiCard label="Recebido"      value={loading ? "..." : fmtBRL(totais.pago)}   color="success" />
          <KpiCard label="Em Aberto"     value={loading ? "..." : fmtBRL(totais.aberto)} color="warning" />
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
                      {g.pedidos.map(p => (
                        <div key={p.id} style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "8px 0", borderBottom: "1px solid #f8fafc", flexWrap: "wrap",
                        }}>
                          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#64748b" }}>#{p.id.slice(0, 8)}</span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>{fmtDate(p.data_inicio_prevista)}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{fmtBRL(p.valor_pedido ?? 0)}</span>
                          {p.forma_pagamento && <span style={{ fontSize: "11px", color: "#94a3b8" }}>{p.forma_pagamento}</span>}
                          {situacaoPedido(p)}
                          <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                            {(parcelasPorPedido.get(p.id)?.length ?? 0) === 0 && !p.pago && (
                              <Btn variant="outline" size="xs" disabled={baixando === p.id} onClick={() => baixarPedido(p.id)}>
                                {baixando === p.id ? "..." : "💰 Baixar"}
                              </Btn>
                            )}
                            <Btn href={`/pedidos/${p.id}`} variant="ghost" size="xs">💳 Abrir pedido</Btn>
                          </span>
                        </div>
                      ))}
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

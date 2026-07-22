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
 * Dados (regra das listagens): o resumo por cliente vem da RPC
 * `faturamento_clientes` em UMA chamada (fallback local sem a migration), e os
 * pedidos de cada cliente carregam SOB DEMANDA ao expandir, paginados de 100
 * em 100 — a tela não baixa mais a tabela inteira de pedidos + parcelas.
 * Lógica de dinheiro centralizada em src/lib/financeiro/faturamentoClientes.ts.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { normalizar } from "@/lib/utils/normalizar";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
import {
  PageHeader, Btn, Badge, KpiCard, EmptyState, SearchInput, Alert,
} from "@/components/ui/ds";
import {
  buscarGruposClientes, buscarPedidosDoCliente, totalDe,
  type GrupoClienteResumo, type PedidoFin, type ParcelaFin,
} from "@/lib/financeiro/faturamentoClientes";
import { FinanceiroPedido, type EmpresaOpcao } from "./_components/FinanceiroPedido";

type DetalheCliente = {
  pedidos: PedidoFin[];
  pagina: number;
  temMais: boolean;
  carregando: boolean;
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const chaveGrupo = (clienteId: string | null) => clienteId ?? "__avulso__";

export default function FaturamentoPage() {
  const router = useRouter();
  const [grupos, setGrupos] = useState<GrupoClienteResumo[]>([]);
  /** pedidos carregados sob demanda, por grupo (chaveGrupo) */
  const [detalhes, setDetalhes] = useState<Map<string, DetalheCliente>>(new Map());
  const [parcelasPorPedido, setParcelasPorPedido] = useState<Map<string, ParcelaFin[]>>(new Map());
  const [empresaIdPadrao, setEmpresaIdPadrao] = useState<string>("");
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "com_pendencia" | "quitados">("com_pendencia");
  const [expandido, setExpandido] = useState<string | null>(null);
  /** pedido com o painel financeiro aberto */
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erroBaixa, setErroBaixa] = useState("");
  /** modal de confirmação de baixa rápida */
  const [confirmBaixa, setConfirmBaixa] = useState<{ pedidoId: string; nomeCliente: string; valor: number } | null>(null);
  const baixandoRef = useRef(false);
  const empresaIdRef = useRef<string>("");
  /** espelho de `expandido` pra `carregar()` saber qual grupo re-buscar (sem virar dependência) */
  const expandidoRef = useRef<string | null>(null);

  // ── pedidos de um cliente, sob demanda (pagina 0 substitui; >0 acrescenta) ──
  const carregarDetalhe = useCallback(async (clienteId: string | null, pagina: number) => {
    const eid = empresaIdRef.current;
    if (!eid) return;
    const key = chaveGrupo(clienteId);
    setDetalhes(prev => {
      const m = new Map(prev);
      const atual = m.get(key);
      m.set(key, {
        pedidos: pagina === 0 ? [] : (atual?.pedidos ?? []),
        pagina, temMais: false, carregando: true,
      });
      return m;
    });

    const supabase = createClient();
    const r = await buscarPedidosDoCliente(supabase, eid, clienteId, pagina);

    setParcelasPorPedido(prev => {
      const m = new Map(prev);
      for (const [id, pars] of r.parcelasPorPedido) m.set(id, pars);
      return m;
    });
    setDetalhes(prev => {
      const m = new Map(prev);
      const atual = m.get(key);
      m.set(key, {
        pedidos: pagina === 0 ? r.pedidos : [...(atual?.pedidos ?? []), ...r.pedidos],
        pagina, temMais: r.temMais, carregando: false,
      });
      return m;
    });
  }, []);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const user = await usuarioSessao();
    if (!user) { router.replace("/login"); return; }
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
      .eq("usuario_id", user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setLoading(false); return; }
    const eid = ue.empresa_id;
    setEmpresaIdPadrao(eid);
    empresaIdRef.current = eid;

    const [gruposNovos, empresasRes] = await Promise.all([
      buscarGruposClientes(supabase, eid, hojeISO()),
      supabase.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia"),
    ]);
    setEmpresas((empresasRes.data ?? []) as EmpresaOpcao[]);
    setGrupos(gruposNovos);
    setLoading(false);

    // recarrega os pedidos do grupo aberto (baixa/painel mudou valores);
    // grupos fechados descartam o cache e recarregam ao expandir de novo
    setDetalhes(new Map());
    const aberto = expandidoRef.current;
    if (aberto !== null) {
      const g = gruposNovos.find(x => chaveGrupo(x.clienteId) === aberto);
      if (g) await carregarDetalhe(g.clienteId, 0);
      else { expandidoRef.current = null; setExpandido(null); } // grupo sumiu (ex.: último pedido cancelado)
    }
  }, [router, carregarDetalhe]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, [carregar]);

  const alternarGrupo = (g: GrupoClienteResumo) => {
    const key = chaveGrupo(g.clienteId);
    const abrir = expandido !== key;
    expandidoRef.current = abrir ? key : null;
    setExpandido(abrir ? key : null);
    if (abrir && !detalhes.has(key)) carregarDetalhe(g.clienteId, 0);
  };

  // ── baixa rápida do pagamento ÚNICO (parcelado dá baixa por parcela no painel) ──
  const confirmarBaixaRapida = async () => {
    if (!confirmBaixa) return;
    if (baixandoRef.current) return; // anti-duplo-clique síncrono
    baixandoRef.current = true;
    setBaixando(confirmBaixa.pedidoId);
    setErroBaixa("");
    const supabase = createClient();
    const { error } = await supabase.from("pedidos").update({
      pago: true,
      data_pagamento: hojeISO(),
    }).eq("id", confirmBaixa.pedidoId);
    if (error) {
      setErroBaixa(`Erro ao registrar pagamento: ${error.message}`);
    } else {
      setConfirmBaixa(null);
      await carregar();
    }
    setBaixando(null);
    baixandoRef.current = false;
  };

  // ── filtros client-side sobre os GRUPOS (resumo por cliente é pequeno) ────
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
    atrasado: acc.atrasado + g.valorAtrasado,
  }), { total: 0, pago: 0, aberto: 0, atrasado: 0 });

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

        <div className="m-kpi-grid" style={{ display: "grid", gap: "10px" }}>
          <KpiCard label="Valor Total" value={loading ? "..." : fmtBRL(totais.total)} />
          <KpiCard label="Recebido"    value={loading ? "..." : fmtBRL(totais.pago)}   color="success" />
          <KpiCard label="Em Aberto"   value={loading ? "..." : fmtBRL(totais.aberto)} color="warning" />
          <KpiCard label="Em Atraso"   value={loading ? "..." : fmtBRL(totais.atrasado)} color="danger" />
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <SearchInput placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
          {([["com_pendencia", "Com pendência"], ["quitados", "Quitados"], ["todos", "Todos"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              style={{
                padding: "6px 14px", minHeight: "44px", borderRadius: "16px", fontSize: "12px", fontWeight: 600,
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
              const key = chaveGrupo(g.clienteId);
              const aberto = expandido === key;
              const det = detalhes.get(key);
              return (
                <div key={key} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  {/* linha do cliente */}
                  <button
                    type="button"
                    onClick={() => alternarGrupo(g)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px", width: "100%",
                      padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#94a3b8", width: "14px" }}>{aberto ? "▾" : "▸"}</span>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>{g.nome}</span>
                      <span className="m-show" style={{ fontSize: "11px", color: "#64748b" }}>
                        {g.qtd} pedido{g.qtd !== 1 ? "s" : ""} · total {fmtBRL(g.valorTotal)}
                      </span>
                    </div>
                    <span className="m-hide" style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {g.qtd} pedido{g.qtd !== 1 ? "s" : ""} · {g.qtdPagos} pago{g.qtdPagos !== 1 ? "s" : ""} · faltam {g.qtd - g.qtdPagos}
                    </span>
                    <span className="m-hide" style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap", minWidth: "110px", textAlign: "right" }}>
                      {fmtBRL(g.valorTotal)}
                    </span>
                    <span style={{
                      fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", textAlign: "right",
                      color: g.valorAberto > 0.009 ? "#d97706" : "#16a34a",
                    }}>
                      {g.valorAberto > 0.009 ? `${fmtBRL(g.valorAberto)} em aberto` : "✓ quitado"}
                    </span>
                  </button>

                  {/* pedidos do cliente — carregados sob demanda */}
                  {aberto && (
                    <div style={{ borderTop: "1px solid #f1f5f9", padding: "4px 16px 12px" }}>
                      {det?.carregando && (det.pedidos.length === 0) && (
                        <p style={{ fontSize: "12px", color: "#94a3b8", padding: "10px 0", margin: 0 }}>Carregando pedidos...</p>
                      )}
                      {(det?.pedidos ?? []).map(p => {
                        const financeiroAberto = pedidoAberto === p.id;
                        const temParcelas = (parcelasPorPedido.get(p.id)?.length ?? 0) > 0;
                        return (
                          <div key={p.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                            <div style={{ padding: "8px 0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 700, color: "#1e293b" }}>{rotuloPedido(p.numero, p.id)}</span>
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
                              </div>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end", marginTop: "6px" }}>
                                {!temParcelas && !p.pago && (
                                  <Btn variant="outline" size="sm" disabled={!!baixando} loading={baixando === p.id}
                                    onClick={() => setConfirmBaixa({ pedidoId: p.id, nomeCliente: g.nome, valor: totalDe(p) })}>
                                    💰 Baixar
                                  </Btn>
                                )}
                                <Btn
                                  variant={financeiroAberto ? "primary" : "outline"} size="sm"
                                  onClick={() => setPedidoAberto(financeiroAberto ? null : p.id)}
                                >
                                  💳 Financeiro {financeiroAberto ? "▴" : "▾"}
                                </Btn>
                                <Btn href={`/despacho/${p.id}`} variant="ghost" size="sm" title="Detalhe operacional no Despacho">🚚</Btn>
                              </div>
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
                      {det?.temMais && (
                        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
                          <Btn variant="outline" size="sm" loading={det.carregando} disabled={det.carregando}
                            onClick={() => carregarDetalhe(g.clienteId, det.pagina + 1)}>
                            Carregar mais pedidos ({det.pedidos.length} de {g.qtd})
                          </Btn>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de confirmação de baixa rápida */}
      {confirmBaixa && (
        <div className="m-modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px",
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "380px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>Confirmar recebimento</h2>
            <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 4px" }}>
              <strong>{confirmBaixa.nomeCliente}</strong>
            </p>
            <p style={{ fontSize: "20px", fontWeight: 800, color: "#16a34a", margin: "0 0 20px" }}>
              {fmtBRL(confirmBaixa.valor)}
            </p>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 20px" }}>
              O pedido será marcado como pago com a data de hoje. Esta ação pode ser revertida editando o pedido.
            </p>
            {erroBaixa && <div style={{ marginBottom: "12px" }}><Alert variant="error">⚠ {erroBaixa}</Alert></div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => { setConfirmBaixa(null); setErroBaixa(""); }} disabled={!!baixando}>Voltar</Btn>
              <Btn variant="primary" onClick={confirmarBaixaRapida} loading={!!baixando} disabled={!!baixando}>
                Confirmar pagamento
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

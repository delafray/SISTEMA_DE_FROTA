"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { loadAll } from "@/lib/utils/loadAll";
import { receitaPedidosConcluidos } from "@/lib/financeiro/kpis";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle, inputStyle, useOrdenacao } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

const PAGE_SIZE = 100;

type Pedido = {
  id: string; status: string;
  valor_pedido: number | null;
  km_inicial: number | null; km_final: number | null;
  data_inicio_prevista: string | null;
  pago: boolean | null; data_pagamento: string | null;
  veiculos: { placa: string; modelo: string } | null;
  motoristas: { nome: string } | null;
  qtd_entregas?: number;
};

const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
  agendado: "warning", agendada: "warning",
  em_andamento: "info",
  concluido: "success", concluida: "success",
  cancelado: "danger", cancelada: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", agendada: "Agendado",
  em_andamento: "Em Andamento",
  concluido: "Concluído", concluida: "Concluído",
  cancelado: "Cancelado", cancelada: "Cancelado",
};

export default function PedidosPage() {
  const router = useRouter();

  // ── Estado de autenticação ────────────────────────────────────────────────
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  // ── Estado de dados ───────────────────────────────────────────────────────
  const [linhas, setLinhas]         = useState<Pedido[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading]       = useState(true);
  const [loadingMais, setLoadingMais] = useState(false);
  const [pagina, setPagina]         = useState(0);
  const [temMais, setTemMais]       = useState(true);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [busca, setBusca]               = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [mostrarPagos, setMostrarPagos] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState("mes_atual");
  const [dataInicio, setDataInicio]     = useState("");
  const [dataFim, setDataFim]           = useState("");

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const [kpiAgendado, setKpiAgendado]           = useState<number | null>(null);
  const [kpiEmAndamento, setKpiEmAndamento]     = useState<number | null>(null);
  const [kpiConcluido, setKpiConcluido]         = useState<number | null>(null);
  const [kpiConcluidoPago, setKpiConcluidoPago] = useState<number | null>(null);
  const [receitaTotal, setReceitaTotal]         = useState<number | null>(null);
  const [receitaPaga, setReceitaPaga]           = useState<number | null>(null);
  const [receitaFiltrada, setReceitaFiltrada]   = useState<number | null>(null);

  // ── Debounce ──────────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscaServidor, setBuscaServidor] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBuscaServidor(busca);
      setPagina(0);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  // Resetar página quando filtros mudam
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPagina(0); }, [filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim]);

  // ── Auth inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (ue?.empresa_id) setEmpresaId(ue.empresa_id);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers de filtros de query ───────────────────────────────────────────

  /** Sanitiza termo de busca removendo caracteres que quebram a sintaxe do .or() */
  const sanitizarBusca = (t: string) => t.replace(/[,%()]/g, "").trim();

  /**
   * Retorna IDs de veículos e motoristas que casam com o termo de busca.
   * Retorna null quando o termo está vazio (sem prefetch necessário).
   * Retorna { veiculoIds: [], motoristaIds: [] } quando nenhum ID casa (resultado vazio garantido se não há col própria).
   */
  const prefetchRelacionados = useCallback(async (
    supabase: ReturnType<typeof createClient>,
    empId: string,
    termo: string
  ): Promise<{ veiculoIds: string[]; motoristaIds: string[] } | null> => {
    if (!termo) return null;
    const [veicRes, motRes] = await Promise.all([
      supabase.from("veiculos").select("id")
        .eq("empresa_id", empId)
        .or(`placa.ilike.%${termo}%,modelo.ilike.%${termo}%`),
      supabase.from("motoristas").select("id")
        .eq("empresa_id", empId)
        .ilike("nome", `%${termo}%`),
    ]);
    return {
      veiculoIds:   (veicRes.data ?? []).map(v => v.id),
      motoristaIds: (motRes.data  ?? []).map(m => m.id),
    };
  }, []);

  /** Aplica filtros de busca e status na query do Supabase. Retorna null se o resultado é vazio garantido. */
  const aplicarFiltros = useCallback((
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: any,
    opts: {
      filtroStatus: string;
      mostrarPagos: boolean;
      filtroPeriodo: string;
      dataInicio: string;
      dataFim: string;
      relacionados: { veiculoIds: string[]; motoristaIds: string[] } | null;
      buscaServidor: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any | null => {
    const { filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, relacionados, buscaServidor } = opts;

    const now = new Date();
    const currentYm   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYear = String(now.getFullYear());
    // primeiro dia do mês seguinte — "YYYY-MM-31" é data inválida em meses de 30 dias e o Postgres rejeita
    const proxMes = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const proxYm  = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, "0")}`;

    // Filtro de status
    if (filtroStatus && !mostrarPagos) {
      query = query.eq("status", filtroStatus);
    }

    // Modo "Ver Concluídos Pagos"
    if (mostrarPagos) {
      query = query
        .in("status", ["concluido", "concluida"])
        .eq("pago", true);

      // Filtro de período nos pagos (data_pagamento com fallback data_inicio_prevista)
      if (filtroPeriodo === "mes_atual") {
        query = query.or(
          `and(data_pagamento.gte.${currentYm}-01,data_pagamento.lt.${proxYm}-01),` +
          `and(data_pagamento.is.null,data_inicio_prevista.gte.${currentYm}-01,data_inicio_prevista.lt.${proxYm}-01)`
        );
      } else if (filtroPeriodo === "ano_atual") {
        query = query.or(
          `and(data_pagamento.gte.${currentYear}-01-01,data_pagamento.lte.${currentYear}-12-31),` +
          `and(data_pagamento.is.null,data_inicio_prevista.gte.${currentYear}-01-01,data_inicio_prevista.lte.${currentYear}-12-31)`
        );
      } else if (filtroPeriodo === "personalizado") {
        const parts: string[] = [];
        if (dataInicio && dataFim) {
          parts.push(
            `and(data_pagamento.gte.${dataInicio},data_pagamento.lte.${dataFim})`,
            `and(data_pagamento.is.null,data_inicio_prevista.gte.${dataInicio},data_inicio_prevista.lte.${dataFim})`
          );
        } else if (dataInicio) {
          parts.push(`data_pagamento.gte.${dataInicio}`, `and(data_pagamento.is.null,data_inicio_prevista.gte.${dataInicio})`);
        } else if (dataFim) {
          parts.push(`data_pagamento.lte.${dataFim}`, `and(data_pagamento.is.null,data_inicio_prevista.lte.${dataFim})`);
        }
        if (parts.length > 0) query = query.or(parts.join(","));
      }
      // filtroPeriodo === "todos": sem filtro adicional
    } else {
      // Modo normal: excluir concluídos pagos
      // Mantém: (status != concluido E status != concluida) OU pago != true OU pago é null
      query = query.or(
        "and(status.neq.concluido,status.neq.concluida),pago.neq.true,pago.is.null"
      );
    }

    // Busca textual em campos relacionados
    if (relacionados !== null) {
      const { veiculoIds, motoristaIds } = relacionados;
      const total = veiculoIds.length + motoristaIds.length;
      if (total === 0) return null; // nenhum cadastro casou → resultado vazio
      const partes: string[] = [];
      if (veiculoIds.length > 0)   partes.push(`veiculo_id.in.(${veiculoIds.join(",")})`);
      if (motoristaIds.length > 0) partes.push(`motorista_id.in.(${motoristaIds.join(",")})`);
      query = query.or(partes.join(","));
    }

    // Suprime aviso de variável não usada (buscaServidor é usado apenas para triggerar o efeito)
    void buscaServidor;

    return query;
  }, []);

  // ── Carregamento de KPIs (contagens + receita) ────────────────────────────
  const carregarKpis = useCallback(async (supabase: ReturnType<typeof createClient>, empId: string) => {
    const [agRes, andRes, conRes, conPagoRes] = await Promise.all([
      supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("empresa_id", empId).or("status.eq.agendado,status.eq.agendada"),
      supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("empresa_id", empId).eq("status", "em_andamento"),
      supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("empresa_id", empId).or("status.eq.concluido,status.eq.concluida"),
      supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("empresa_id", empId).or("status.eq.concluido,status.eq.concluida").eq("pago", true),
    ]);
    setKpiAgendado(agRes.count ?? 0);
    setKpiEmAndamento(andRes.count ?? 0);
    setKpiConcluido(conRes.count ?? 0);
    setKpiConcluidoPago(conPagoRes.count ?? 0);

    // Receita: soma no SERVIDOR via RPC (fallback interno enquanto a migration não rodou)
    const receita = await receitaPedidosConcluidos(supabase, empId);
    setReceitaTotal(receita.receitaTotal);
    setReceitaPaga(receita.receitaPaga);
  }, []);

  // Ordenação no SERVIDOR (lista paginada — ordenar só os 100 da página mentiria).
  // Ao trocar coluna, volta para a primeira página para a contagem bater.
  const { ordem, thSort } = useOrdenacao(() => setPagina(0));

  // ── Carregamento da lista principal ──────────────────────────────────────
  const carregarPagina = useCallback(async (
    supabase: ReturnType<typeof createClient>,
    empId: string,
    paginaAtual: number,
    append: boolean
  ) => {
    if (paginaAtual === 0) setLoading(true); else setLoadingMais(true);

    try {
      const termo = sanitizarBusca(buscaServidor);
      const relacionados = await prefetchRelacionados(supabase, empId, termo);

      // Resultado vazio garantido (busca não casou nenhum ID relacionado)
      if (relacionados !== null && relacionados.veiculoIds.length === 0 && relacionados.motoristaIds.length === 0) {
        if (!append) { setLinhas([]); setTotalCount(0); }
        setTemMais(false);
        return;
      }

      // Query de contagem total (mesmos filtros, sem range)
      const countQ = supabase.from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empId);
      const filteredCountQ = aplicarFiltros(countQ, {
        filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, relacionados, buscaServidor,
      });
      if (filteredCountQ === null) {
        if (!append) { setLinhas([]); setTotalCount(0); }
        setTemMais(false);
        return;
      }
      const { count } = await filteredCountQ;
      setTotalCount(count ?? 0);

      // Query de dados
      const from = paginaAtual * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;
      // Ordenação no servidor: switch pela coluna escolhida no cabeçalho.
      // nullsFirst: false → registros sem valor ficam no fim (comportamento esperado).
      // Desempate estável por id antes do .range() para paginação consistente.
      const asc = ordem?.asc ?? true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dataQ: any = supabase.from("pedidos")
        .select("id,numero,status,valor_pedido,km_inicial,km_final,data_inicio_prevista,pago,data_pagamento,veiculos(placa,modelo),motoristas(nome)")
        .eq("empresa_id", empId);
      switch (ordem?.col) {
        case "status":    dataQ = dataQ.order("status",                { ascending: asc }); break;
        case "veiculo":   dataQ = dataQ.order("veiculos(placa)",       { ascending: asc, nullsFirst: false }); break;
        case "motorista": dataQ = dataQ.order("motoristas(nome)",      { ascending: asc, nullsFirst: false }); break;
        case "previsto":  dataQ = dataQ.order("data_inicio_prevista",  { ascending: asc, nullsFirst: false }); break;
        case "valor":     dataQ = dataQ.order("valor_pedido",          { ascending: asc, nullsFirst: false }); break;
        case "km":        dataQ = dataQ.order("km_inicial",            { ascending: asc, nullsFirst: false }); break;
        default:          dataQ = dataQ.order("created_at",            { ascending: false }); // padrão: mais recente primeiro
      }
      dataQ = dataQ.order("id", { ascending: true }).range(from, to);
      const filteredDataQ = aplicarFiltros(dataQ, {
        filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, relacionados, buscaServidor,
      });
      if (filteredDataQ === null) {
        if (!append) { setLinhas([]); setTotalCount(0); }
        setTemMais(false);
        return;
      }
      const { data, error } = await filteredDataQ;
      if (error) {
        console.error("Erro ao carregar pedidos:", error);
        return;
      }
      const novas = (data ?? []) as Pedido[];
      setLinhas(prev => append ? [...prev, ...novas] : novas);
      setTemMais(novas.length >= PAGE_SIZE);

      // Receita filtrada — soma sobre todas as linhas do filtro atual
      // soma precisa de todas as linhas; payload mínimo até existir RPC de agregação
      if (paginaAtual === 0) {
        const somaQ = supabase.from("pedidos")
          .select("valor_pedido")
          .eq("empresa_id", empId);
        const filteredSomaQ = aplicarFiltros(somaQ, {
          filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, relacionados, buscaServidor,
        });
        if (filteredSomaQ !== null) {
          const todasLinhas = await loadAll<{ valor_pedido: number | null }>((f, t) =>
            filteredSomaQ.range(f, t)
          );
          setReceitaFiltrada(todasLinhas.reduce((s, r) => s + (r.valor_pedido ?? 0), 0));
        } else {
          setReceitaFiltrada(0);
        }
      }
    } finally {
      if (paginaAtual === 0) setLoading(false); else setLoadingMais(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, buscaServidor, filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, ordem, aplicarFiltros, prefetchRelacionados]);

  // ── KPIs: globais da empresa, não dependem de busca/filtro ────────────────
  useEffect(() => {
    if (!empresaId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarKpis(createClient(), empresaId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // ── Efeito principal: recarrega quando empresa, filtros ou ordenação mudam ─
  useEffect(() => {
    if (!empresaId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarPagina(createClient(), empresaId, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, buscaServidor, filtroStatus, mostrarPagos, filtroPeriodo, dataInicio, dataFim, ordem]);

  // ── Carregar mais (append) ────────────────────────────────────────────────
  const handleCarregarMais = () => {
    if (!empresaId || loadingMais || !temMais) return;
    const proxPagina = pagina + 1;
    setPagina(proxPagina);
    const supabase = createClient();
    carregarPagina(supabase, empresaId, proxPagina, true);
  };

  // ── Marcar pago ──────────────────────────────────────────────────────────
  const [loadingPago, setLoadingPago] = useState<Set<string>>(new Set());
  const [confirmReceberPedido, setConfirmReceberPedido] = useState<string | null>(null);
  const [erroPago, setErroPago] = useState("");

  const handleMarcarPago = async (id: string) => {
    if (loadingPago.has(id)) return;
    setErroPago("");
    setLoadingPago(prev => new Set(prev).add(id));
    try {
      const supabase = createClient();
      const today = new Date().toLocaleDateString("en-CA");
      const { error } = await supabase
        .from("pedidos")
        .update({ pago: true, data_pagamento: today })
        .eq("id", id);
      if (error) {
        setErroPago("Erro ao salvar pagamento: " + error.message);
      } else {
        setLinhas(prev => prev.map(p => p.id === id ? { ...p, pago: true, data_pagamento: today } : p));
        // Atualiza KPIs
        if (empresaId) carregarKpis(createClient(), empresaId);
      }
    } catch (err) {
      setErroPago("Erro inesperado: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingPago(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  // ── KPI derivados ────────────────────────────────────────────────────────
  const kpiConcluidoPendente = kpiConcluido !== null && kpiConcluidoPago !== null
    ? kpiConcluido - kpiConcluidoPago
    : null;

  // receitaFiltrada respeita os filtros ativos (incl. período dos pagos); receitaPaga global é só fallback
  const receitaExibida = receitaFiltrada ?? (mostrarPagos ? receitaPaga : null);
  const receitaExibidaLabel = mostrarPagos ? "Receita Paga (Período)" : "Receita Pendente";

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
      <SearchInput placeholder="Buscar veículo ou motorista..." value={busca} onChange={e => setBusca(e.target.value)} />
      <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0); }}
        style={{ ...selectStyle, width: "160px" }}
        disabled={mostrarPagos}>
        <option value="">Todos os status</option>
        <option value="agendado">Agendado</option>
        <option value="em_andamento">Em Andamento</option>
        <option value="concluido">Concluído</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <Btn variant={mostrarPagos ? "primary" : "outline"} onClick={() => { setMostrarPagos(!mostrarPagos); if (!mostrarPagos) setFiltroStatus(""); setPagina(0); }}>
        {mostrarPagos ? "↩ Ver Ativos / Pendentes" : "💰 Ver Concluídos Pagos"}
      </Btn>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: mostrarPagos ? "#475569" : "#cbd5e1", fontWeight: 500 }}>Período Pago:</span>
        <select value={filtroPeriodo} onChange={e => { setFiltroPeriodo(e.target.value); setPagina(0); }}
          style={{ ...selectStyle, width: "140px", borderColor: mostrarPagos ? undefined : "#e2e8f0", color: mostrarPagos ? undefined : "#94a3b8" }}
          disabled={!mostrarPagos}>
          <option value="mes_atual">Mês Atual</option>
          <option value="ano_atual">Ano Atual</option>
          <option value="personalizado">Personalizado</option>
          <option value="todos">Todos</option>
        </select>
        {mostrarPagos && filtroPeriodo === "personalizado" && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPagina(0); }}
              style={{ ...inputStyle, width: "125px", padding: "4px 8px", fontSize: "12px" }} />
            <span style={{ fontSize: "11px", color: "#64748b" }}>até</span>
            <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPagina(0); }}
              style={{ ...inputStyle, width: "125px", padding: "4px 8px", fontSize: "12px" }} />
          </div>
        )}
      </div>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {linhas.length} de {totalCount} pedidos
      </span>
    </div>
  );

  // ── Botão "Carregar mais" ─────────────────────────────────────────────────
  const btnCarregarMais = temMais && !loading && (
    <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      <Btn variant="outline" onClick={handleCarregarMais} disabled={loadingMais}>
        {loadingMais ? "Carregando..." : `Carregar mais (${linhas.length} de ${totalCount})`}
      </Btn>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Pedidos" count={loading ? undefined : totalCount}>
        <Btn href="/entregas/novo" size="sm">+ Novo Pedido</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {erroPago && (
          // fixed: o erro precisa aparecer ONDE o usuário está — no topo da
          // lista ele ficava fora da viewport depois do scroll e ninguém via
          <div role="alert" style={{
            position: "fixed", left: "16px", right: "16px", zIndex: 1300,
            bottom: "calc(var(--bottom-nav-h, 56px) + env(safe-area-inset-bottom, 0px) + 16px)",
            background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5",
            borderRadius: "8px", padding: "12px 14px", fontSize: "13px", fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{ flex: 1 }}>{erroPago}</span>
            <button onClick={() => setErroPago("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#b91c1c", minHeight: "44px", minWidth: "44px" }}>✕</button>
          </div>
        )}
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Agendados" value={kpiAgendado === null ? "..." : kpiAgendado} color="warning" />
          <KpiCard label="Em Andamento" value={kpiEmAndamento === null ? "..." : kpiEmAndamento} color="info" />
          <KpiCard label="Concluídos" value={kpiConcluido === null ? "..." : kpiConcluido} color="success"
            sub={kpiConcluidoPendente === null ? undefined : `${kpiConcluidoPendente} pendentes / ${kpiConcluidoPago} pagos`} />
          <KpiCard label={receitaExibidaLabel}
            value={receitaExibida === null ? "..." : `R$ ${receitaExibida.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color="success"
            sub={receitaTotal === null ? undefined : `Total: R$ ${receitaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </div>

        <div className="m-show-block" style={{ display: "none" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <SearchInput placeholder="Buscar veículo ou motorista..." value={busca} onChange={e => setBusca(e.target.value)} />
            <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0); }}
              style={{ ...selectStyle, flex: "1 1 120px" }}
              disabled={mostrarPagos}>
              <option value="">Todos os status</option>
              <option value="agendado">Agendado</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <Btn variant={mostrarPagos ? "primary" : "outline"} onClick={() => { setMostrarPagos(!mostrarPagos); if (!mostrarPagos) setFiltroStatus(""); setPagina(0); }}>
              {mostrarPagos ? "↩ Ativos" : "💰 Pagos"}
            </Btn>
            {mostrarPagos && (
              <>
                <select value={filtroPeriodo} onChange={e => { setFiltroPeriodo(e.target.value); setPagina(0); }}
                  style={{ ...selectStyle, flex: "1 1 120px" }}>
                  <option value="mes_atual">Mês Atual</option>
                  <option value="ano_atual">Ano Atual</option>
                  <option value="personalizado">Personalizado</option>
                  <option value="todos">Todos</option>
                </select>
                {filtroPeriodo === "personalizado" && (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%" }}>
                    <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPagina(0); }}
                      style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: "13px" }} />
                    <span style={{ fontSize: "11px", color: "#64748b", flexShrink: 0 }}>até</span>
                    <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPagina(0); }}
                      style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: "13px" }} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="m-hide">
        <DataTable count={linhas.length} label="pedidos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th {...thSort("status")}>Status</Th>
              <Th {...thSort("veiculo")}>Veículo</Th>
              <Th {...thSort("motorista")}>Motorista</Th>
              <Th {...thSort("previsto")}>Início</Th>
              <Th {...thSort("valor")} style={{ textAlign: "right" }}>Valor (R$)</Th>
              <Th {...thSort("km")} style={{ textAlign: "right" }}>KM Inicial</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : linhas.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {totalCount === 0 && !buscaServidor && !filtroStatus
                    ? <EmptyState message="Nenhum pedido cadastrado." icon="📦" action={<Btn href="/entregas/novo">+ Criar primeiro pedido</Btn>} />
                    : <EmptyState message="Nenhum pedido encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              // Ordenação vem do servidor (switch acima no carregarPagina).
              linhas.map(pedido => {
                const veiculo   = Array.isArray(pedido.veiculos) ? pedido.veiculos[0] : pedido.veiculos;
                const motorista = Array.isArray(pedido.motoristas) ? pedido.motoristas[0] : pedido.motoristas;
                const concluido = pedido.status === "concluido" || pedido.status === "concluida";
                return (
                  <Tr key={pedido.id} onClick={() => router.push(`/entregas/${pedido.id}/editar`)}>
                    <Td>
                      <Badge variant={STATUS_VAR[pedido.status] ?? "default"}>
                        {STATUS_LABEL[pedido.status] ?? pedido.status}
                      </Badge>
                    </Td>
                    <Td style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={veiculo ? `${veiculo.placa} (${veiculo.modelo})` : ""}>
                      {veiculo?.placa ?? "—"}
                      {veiculo?.modelo && <span style={{ color: "#94a3b8", fontSize: "10px", marginLeft: "4px" }}>({veiculo.modelo})</span>}
                    </Td>
                    <Td style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={motorista?.nome ?? ""}>{motorista?.nome ?? "—"}</Td>
                    <Td>
                      {pedido.data_inicio_prevista
                        ? new Date(pedido.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>
                        {pedido.valor_pedido
                          ? pedido.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                          : "—"}
                      </div>
                      <div style={{ marginTop: "2px" }}>
                        {pedido.pago ? (
                          <Badge variant="success">Pago</Badge>
                        ) : concluido ? (
                          <Badge variant="danger">Pendente</Badge>
                        ) : (
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>A faturar</span>
                        )}
                      </div>
                    </Td>
                    <Td style={{ textAlign: "right" }}>{pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                        <Btn href={`/entregas/${pedido.id}`} variant="ghost" size="sm" onClick={e => e.stopPropagation()}>Ver</Btn>
                        <Btn href={`/entregas/${pedido.id}/editar`} variant="outline" size="sm" onClick={e => e.stopPropagation()}>Editar</Btn>
                        {!pedido.pago && concluido && (
                          <Btn
                            variant="outline"
                            size="sm"
                            loading={loadingPago.has(pedido.id)}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setConfirmReceberPedido(pedido.id);
                            }}
                            style={{ color: "#16a34a", borderColor: "#16a34a" }}
                          >
                            Receber
                          </Btn>
                        )}
                        <DeleteBtn id={pedido.id} table="pedidos" label="pedido" />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        </div>

        <MobileList count={loading ? undefined : linhas.length} label="pedidos">
          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>Carregando pedidos...</div>
          ) : linhas.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              {buscaServidor || filtroStatus ? (
                <div>
                  <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 12px" }}>Nenhum pedido encontrado para esta busca.</p>
                  <Btn variant="outline" size="sm" onClick={() => { setBusca(""); setBuscaServidor(""); setFiltroStatus(""); setMostrarPagos(false); setPagina(0); }}>
                    Limpar filtros
                  </Btn>
                </div>
              ) : (
                <div>
                  <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 12px" }}>Nenhum pedido cadastrado.</p>
                  <Btn href="/entregas/novo" size="sm">+ Criar primeiro pedido</Btn>
                </div>
              )}
            </div>
          ) : linhas.map(pedido => {
            const veiculo   = Array.isArray(pedido.veiculos) ? pedido.veiculos[0] : pedido.veiculos;
            const motorista = Array.isArray(pedido.motoristas) ? pedido.motoristas[0] : pedido.motoristas;
            const concluido = pedido.status === "concluido" || pedido.status === "concluida";
            const statusColor = concluido ? "#16a34a" : pedido.status === "em_andamento" ? "#2563eb" : pedido.status === "cancelado" || pedido.status === "cancelada" ? "#ef4444" : "#eab308";
            return (
              <MobileCard
                key={pedido.id}
                // onClick (não href): card com botão dentro viraria <a> aninhado
                onClick={() => router.push(`/entregas/${pedido.id}`)}
                title={`Pedido ${rotuloPedido((pedido as { numero?: string | null }).numero, pedido.id)}`}
                subtitle={motorista?.nome ?? "Sem motorista"}
                badge={<Badge variant={STATUS_VAR[pedido.status] ?? "default"}>{STATUS_LABEL[pedido.status] ?? pedido.status}</Badge>}
                highlight={statusColor}
                details={[
                  { label: "Valor", value: pedido.valor_pedido ? `R$ ${pedido.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                  { label: "Veículo", value: veiculo?.placa ?? "—" },
                  { label: "Início", value: pedido.data_inicio_prevista ? new Date(pedido.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                  { label: "Pgto", value: pedido.pago ? <Badge variant="success">Pago</Badge> : concluido ? <Badge variant="danger">Pendente</Badge> : "A faturar" },
                ]}
                actions={
                  <>
                    <Btn href={`/entregas/${pedido.id}/editar`} size="sm" variant="outline" onClick={e => e.stopPropagation()}>Editar</Btn>
                    {!pedido.pago && concluido && (
                      <Btn
                        size="sm"
                        variant="outline"
                        loading={loadingPago.has(pedido.id)}
                        onClick={(e) => { e.stopPropagation(); if (loadingPago.has(pedido.id)) return; setConfirmReceberPedido(pedido.id); }}
                        style={{ color: "#16a34a", borderColor: "#16a34a" }}
                      >
                        Receber
                      </Btn>
                    )}
                  </>
                }
              />
            );
          })}
        </MobileList>
        {btnCarregarMais}

        <MobileFAB href="/entregas/novo" label="Novo Pedido" />
      </div>

      {/* Modal de confirmação — Receber pagamento */}
      {confirmReceberPedido && (() => {
        const pedidoConfirm = linhas.find(p => p.id === confirmReceberPedido);
        const rotulo = rotuloPedido((pedidoConfirm as { numero?: string | null } | undefined)?.numero, confirmReceberPedido);
        const valorConfirm = pedidoConfirm?.valor_pedido
          ? `R$ ${pedidoConfirm.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : null;
        return (
          <div className="m-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "16px", color: "#1e293b" }}>Confirmar recebimento</h3>
              <p style={{ margin: "0 0 4px", fontSize: "14px", color: "#475569" }}>
                Confirmar recebimento do <strong>Pedido {rotulo}</strong>
                {valorConfirm && <> — <strong style={{ color: "#16a34a" }}>{valorConfirm}</strong></>}?
              </p>
              <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#94a3b8" }}>A data de hoje será registrada como data de pagamento.</p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Btn variant="outline" onClick={() => setConfirmReceberPedido(null)}>Voltar</Btn>
                <Btn
                  variant="primary"
                  loading={loadingPago.has(confirmReceberPedido)}
                  onClick={async () => {
                    const pedidoId = confirmReceberPedido;
                    setConfirmReceberPedido(null);
                    await handleMarcarPago(pedidoId);
                  }}
                  style={{ background: "#16a34a" }}
                >
                  Confirmar
                </Btn>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Adiantamento = {
  id: string;
  valor: number;
  tipo: string;
  status: string;
  justificativa: string | null;
  data_pagamento: string | null;
  created_at: string | null;
  motorista_id: string;
  motoristas: { nome: string } | null;
};

const PAGE_SIZE = 100;

const TIPO_LABEL: Record<string, string> = {
  adiantamento: "Adiantamento",
  vale: "Vale",
  despesa_viagem: "Despesa de Viagem",
  outros: "Outros",
};

const STATUS_BADGE: Record<string, "warning" | "success" | "danger" | "info"> = {
  pendente: "warning",
  aprovado: "success",
  recusado: "danger",
  prestado: "info",
};

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Remove caracteres que quebram a sintaxe do .or() do Supabase */
function sanitizarBusca(s: string): string {
  return s.replace(/[,%()]/g, "").trim();
}

export default function AdiantamentosPage() {
  const router = useRouter();

  // --- estado de autenticação/empresa ---
  const empresaIdRef = useRef<string | null>(null);

  // --- listagem paginada ---
  const [linhas, setLinhas]         = useState<Adiantamento[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMais, setLoadingMais] = useState(false);
  const [pagina, setPagina]         = useState(0);
  const [temMais, setTemMais]       = useState(false);
  const [total, setTotal]           = useState<number | undefined>(undefined);

  // --- filtros ---
  const [busca, setBusca]           = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  // --- KPIs (soma de valor por status) ---
  const [kpiSolicitado, setKpiSolicitado] = useState<number | null>(null);
  const [kpiAprovado,   setKpiAprovado]   = useState<number | null>(null);
  const [kpiPendente,   setKpiPendente]   = useState<number | null>(null);
  const [kpiPrestado,   setKpiPrestado]   = useState<number | null>(null);

  // --- debounce da busca ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Prefetch de motoristas que casam com o termo (retorna IDs ou null se não aplicável) */
  const buscarMotoristaIds = useCallback(async (
    supabase: ReturnType<typeof createClient>,
    empresaId: string,
    termo: string
  ): Promise<string[] | null> => {
    if (!termo) return null;
    const { data } = await supabase
      .from("motoristas")
      .select("id")
      .eq("empresa_id", empresaId)
      .ilike("nome", `%${termo}%`);
    return data?.map((m: { id: string }) => m.id) ?? [];
  }, []);

  /** Monta os filtros de texto/status sobre um query builder base (any — Supabase builder é fluente) */
  const aplicarFiltros = useCallback((
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: any,
    busca: string,
    filtroStatus: string,
    motoristaIds: string[] | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any => {
    let r = query;

    if (filtroStatus) {
      r = r.eq("status", filtroStatus);
    }

    if (busca) {
      // Colunas próprias buscáveis: tipo, justificativa
      const termoProprio = `tipo.ilike.%${busca}%,justificativa.ilike.%${busca}%`;

      if (motoristaIds !== null && motoristaIds.length > 0) {
        // Combina coluna própria + in de motorista_id
        r = r.or(`${termoProprio},motorista_id.in.(${motoristaIds.join(",")})`);
      } else {
        // Sem motoristas correspondentes ou prefetch não aplicável — busca só nas colunas próprias
        r = r.or(termoProprio);
      }
    }

    return r;
  }, []);

  // -----------------------------------------------------------------------
  // Carrega KPIs (soma de valor por status) — usa loadAll com payload mínimo
  // Os KPIs mostram totais GLOBAIS (sem filtros de busca/status da listagem),
  // porque os cards são independentes do filtro ativo (comportamento original).
  // soma precisa de todas as linhas; payload mínimo até existir RPC de agregação
  // -----------------------------------------------------------------------
  const carregarKpis = useCallback(async (
    supabase: ReturnType<typeof createClient>,
    empresaId: string
  ) => {
    const linhasValor = await loadAll<{ valor: number; status: string }>((from, to) =>
      supabase
        .from("adiantamentos")
        .select("valor,status")
        .eq("empresa_id", empresaId)
        .order("id", { ascending: true })
        .range(from, to)
    );

    let solicitado = 0, aprovado = 0, pendente = 0, prestado = 0;
    for (const a of linhasValor) {
      solicitado += a.valor ?? 0;
      if (a.status === "aprovado") aprovado += a.valor ?? 0;
      if (a.status === "pendente") pendente += a.valor ?? 0;
      if (a.status === "prestado") prestado += a.valor ?? 0;
    }
    setKpiSolicitado(solicitado);
    setKpiAprovado(aprovado);
    setKpiPendente(pendente);
    setKpiPrestado(prestado);
  }, []);

  // -----------------------------------------------------------------------
  // Busca uma página — append ou replace dependendo do parâmetro
  // -----------------------------------------------------------------------
  const buscarPagina = useCallback(async (
    paginaAlvo: number,
    buscaAtual: string,
    filtroStatusAtual: string,
    append: boolean
  ) => {
    const supabase = createClient();
    const empresaId = empresaIdRef.current;
    if (!empresaId) return;

    if (append) setLoadingMais(true);
    else setLoading(true);

    try {
      const termoSanitizado = sanitizarBusca(buscaAtual);

      // Prefetch motoristas se há termo de busca
      const motoristaIds = termoSanitizado
        ? await buscarMotoristaIds(supabase, empresaId, termoSanitizado)
        : null;

      // Se buscou por texto mas nenhum motorista casou E não há coluna própria,
      // ainda consulta (tipo e justificativa podem casar) — então não cortamos aqui.

      const from = paginaAlvo * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      // Query de contagem total (mesmo filtro, sem linhas)
      {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let cq: any = supabase
          .from("adiantamentos")
          .select("*", { count: "exact", head: true })
          .eq("empresa_id", empresaId);
        cq = aplicarFiltros(cq, termoSanitizado, filtroStatusAtual, motoristaIds);
        const { count } = await cq;
        setTotal(count ?? 0);
      }

      // Query de linhas
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q: any = supabase
        .from("adiantamentos")
        .select("id,valor,tipo,status,justificativa,data_pagamento,created_at,motorista_id,motoristas(nome)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      q = aplicarFiltros(q, termoSanitizado, filtroStatusAtual, motoristaIds);

      const { data } = await q;
      const novas: Adiantamento[] = data ?? [];

      setLinhas(prev => append ? [...prev, ...novas] : novas);
      setTemMais(novas.length === PAGE_SIZE);
      setPagina(paginaAlvo);
    } finally {
      setLoading(false);
      setLoadingMais(false);
    }
  }, [aplicarFiltros, buscarMotoristaIds]);

  // -----------------------------------------------------------------------
  // Inicialização (auth + empresa + primeira página + KPIs)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase
        .from("usuario_empresas")
        .select("empresa_id")
        .eq("usuario_id", auth.user.id)
        .eq("is_padrao", true)
        .single();
      if (!ue?.empresa_id) return;

      empresaIdRef.current = ue.empresa_id;

      await Promise.all([
        buscarPagina(0, "", "", false),
        carregarKpis(supabase, ue.empresa_id),
      ]);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Reage a mudanças de busca/filtro com debounce de 350ms
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      buscarPagina(0, busca, filtroStatus, false);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, filtroStatus]);

  // -----------------------------------------------------------------------
  // "Carregar mais"
  // -----------------------------------------------------------------------
  const handleCarregarMais = () => {
    if (!loadingMais) {
      buscarPagina(pagina + 1, busca, filtroStatus, true);
    }
  };

  // -----------------------------------------------------------------------
  // Toolbar
  // -----------------------------------------------------------------------
  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por motorista, tipo, justificativa..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        style={{ ...selectStyle, width: "150px" }}>
        <option value="">Todos os status</option>
        <option value="pendente">Pendente</option>
        <option value="aprovado">Aprovado</option>
        <option value="recusado">Recusado</option>
        <option value="prestado">Prestado</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {total !== undefined ? `${linhas.length} de ${total} adiantamentos` : "Carregando..."}
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Adiantamentos" subtitle="Controle de adiantamentos e vales dos motoristas" count={loading ? undefined : total}>
        <Btn href="/adiantamentos/novo" size="sm">+ Novo Adiantamento</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
          <KpiCard label="Total Solicitado" value={kpiSolicitado !== null ? fmt.format(kpiSolicitado) : "..."} color="default" />
          <KpiCard label="Total Aprovado"   value={kpiAprovado   !== null ? fmt.format(kpiAprovado)   : "..."} color="success" />
          <KpiCard label="Total Pendente"   value={kpiPendente   !== null ? fmt.format(kpiPendente)   : "..."} color="warning" />
          <KpiCard label="Total Prestado"   value={kpiPrestado   !== null ? fmt.format(kpiPrestado)   : "..."} color="info" />
        </div>

        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={linhas.length} label="adiantamentos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Motorista</Th>
              <Th>Tipo</Th>
              <Th>Valor</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : linhas.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {total === 0 && !busca && !filtroStatus
                    ? <EmptyState message="Nenhum adiantamento cadastrado." icon="💸" action={<Btn href="/adiantamentos/novo">+ Novo Adiantamento</Btn>} />
                    : <EmptyState message="Nenhum adiantamento encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              linhas.map(a => {
                const data = a.created_at
                  ? new Date(a.created_at).toLocaleDateString("pt-BR")
                  : "—";
                return (
                  <Tr key={a.id}>
                    <Td>{data}</Td>
                    <Td>{a.motoristas?.nome ?? "—"}</Td>
                    <Td>{TIPO_LABEL[a.tipo] ?? a.tipo}</Td>
                    <Td style={{ fontWeight: 600 }}>{fmt.format(a.valor)}</Td>
                    <Td>
                      <Badge variant={STATUS_BADGE[a.status] ?? "default"}>
                        {a.status.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/adiantamentos/${a.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={a.id} table="adiantamentos" label="adiantamento" />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        </div>

        {/* Botão "Carregar mais" — desktop e mobile */}
        {temMais && !loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
            <Btn variant="outline" onClick={handleCarregarMais} disabled={loadingMais}>
              {loadingMais
                ? "Carregando..."
                : `Carregar mais (${linhas.length} de ${total ?? "?"})`}
            </Btn>
          </div>
        )}

        {/* Mobile: cards */}
        <MobileList count={linhas.length} label="adiantamentos">
          {loading ? null : linhas.map(a => {
            const data = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";
            const statusColor = a.status === "aprovado" ? "#16a34a" : a.status === "recusado" ? "#ef4444" : a.status === "prestado" ? "#2563eb" : "#eab308";
            return (
              <MobileCard
                key={a.id}
                href={`/adiantamentos/${a.id}/editar`}
                title={a.motoristas?.nome ?? "Sem motorista"}
                subtitle={`${data} • ${TIPO_LABEL[a.tipo] ?? a.tipo}`}
                badge={
                  <Badge variant={STATUS_BADGE[a.status] ?? "default"}>
                    {a.status.toUpperCase()}
                  </Badge>
                }
                highlight={statusColor}
                details={[
                  { label: "Valor", value: fmt.format(a.valor) },
                  { label: "Status", value: a.status.charAt(0).toUpperCase() + a.status.slice(1) },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/adiantamentos/novo" label="Novo Adiantamento" />
      </div>
    </div>
  );
}

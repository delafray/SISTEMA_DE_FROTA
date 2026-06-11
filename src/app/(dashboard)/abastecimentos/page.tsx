"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle, useOrdenacao } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

const PAGE_SIZE = 100;

type Abastecimento = {
  id: string;
  km_no_abast: number | null;
  litros: number;
  valor_litro: number | null;
  valor_total: number;
  posto: string | null;
  confirmado: boolean | null;
  created_at: string | null;
  veiculo_id: string;
  motorista_id: string;
  veiculos: { placa: string; modelo: string } | null;
  motoristas: { nome: string } | null;
};

function sanitizarBusca(s: string): string {
  // Remove caracteres que quebram a sintaxe do .or() do Supabase
  return s.replace(/[,()%]/g, "").trim();
}

export default function AbastecimentosPage() {
  const router = useRouter();
  const [linhas, setLinhas]         = useState<Abastecimento[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMais, setLoadingMais] = useState(false);
  const [pagina, setPagina]         = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [busca, setBusca]           = useState("");
  const [filtro, setFiltro]         = useState("");
  const [empresaId, setEmpresaId]   = useState<string | null>(null);

  // KPIs de soma (precisam de todas as linhas; payload mínimo até existir RPC de agregação)
  const [kpiCount, setKpiCount]         = useState<number | null>(null);
  const [kpiLitros, setKpiLitros]       = useState<number | null>(null);
  const [kpiCusto, setKpiCusto]         = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ordenação no cabeçalho — corre no SERVIDOR (lista paginada).
  // Ao reordenar, volta para a primeira página para não exibir página parcial.
  const { ordem, thSort } = useOrdenacao(() => setPagina(0));

  // ─── Auth / empresa ───────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Busca / filtro / ordenação com debounce ──────────────────────────────
  useEffect(() => {
    if (!empresaId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPagina(0);
      setLinhas([]);
      buscarPagina(0, true);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, filtro, empresaId, ordem]);

  // ─── Helpers de query ─────────────────────────────────────────────────────
  async function resolverIdsRelacionados(supabase: ReturnType<typeof createClient>, termoNorm: string, eid: string) {
    // Prefetch IDs de veículos e motoristas que casam com o termo
    const [{ data: veics }, { data: mots }] = await Promise.all([
      supabase.from("veiculos")
        .select("id")
        .eq("empresa_id", eid)
        .or(`placa.ilike.%${termoNorm}%,modelo.ilike.%${termoNorm}%`)
        .limit(200),
      supabase.from("motoristas")
        .select("id")
        .eq("empresa_id", eid)
        .ilike("nome", `%${termoNorm}%`)
        .limit(200),
    ]);
    const veicIds = (veics ?? []).map((v: { id: string }) => v.id);
    const motIds  = (mots  ?? []).map((m: { id: string }) => m.id);
    return { veicIds, motIds };
  }

  function buildOrFilter(termoNorm: string, veicIds: string[], motIds: string[]): string | null {
    const partes: string[] = [];
    // Coluna própria buscável na tabela
    partes.push(`posto.ilike.%${termoNorm}%`);
    if (veicIds.length > 0) partes.push(`veiculo_id.in.(${veicIds.join(",")})`);
    if (motIds.length  > 0) partes.push(`motorista_id.in.(${motIds.join(",")})`);
    return partes.length > 0 ? partes.join(",") : null;
  }

  // ─── Busca paginada ───────────────────────────────────────────────────────
  async function buscarPagina(pag: number, substituir: boolean) {
    if (!empresaId) return;
    const eid = empresaId; // narrowed to string
    if (pag === 0) setLoading(true); else setLoadingMais(true);

    const supabase = createClient();
    // ilike já é case-insensitive; não normalizar acentos ou o termo deixa de casar com o dado do banco
    const termo = sanitizarBusca(busca);

    // Resolve IDs de relacionados quando há busca textual
    let orFilter: string | null = null;
    if (termo) {
      const { veicIds, motIds } = await resolverIdsRelacionados(supabase, termo, eid);
      // Se o termo não casou nenhum relacionado E não há coluna própria que possa casar,
      // ainda vale buscar por posto — apenas montamos o filtro normalmente.
      orFilter = buildOrFilter(termo, veicIds, motIds);
    }

    const from = pag * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from("abastecimentos")
      .select("id,km_no_abast,litros,valor_litro,valor_total,posto,confirmado,created_at,veiculo_id,motorista_id,veiculos(placa,modelo),motoristas(nome)", { count: "exact" })
      .eq("empresa_id", eid);

    // Ordenação escolhida no cabeçalho — roda no servidor antes do .range().
    // Joins to-one (veiculo_id / motorista_id) ordenam via embed do PostgREST.
    const asc = ordem?.asc ?? true;
    switch (ordem?.col) {
      case "data":      q = q.order("created_at", { ascending: asc }); break;
      case "veiculo":   q = q.order("veiculos(placa)", { ascending: asc, nullsFirst: false }); break;
      case "motorista": q = q.order("motoristas(nome)", { ascending: asc, nullsFirst: false }); break;
      case "posto":     q = q.order("posto", { ascending: asc, nullsFirst: false }); break;
      case "litros":    q = q.order("litros", { ascending: asc }); break;
      case "total":     q = q.order("valor_total", { ascending: asc }); break;
      case "status":    q = q.order("confirmado", { ascending: asc }); break;
      default:          q = q.order("created_at", { ascending: false }); // mais recente primeiro
    }
    q = q.order("id", { ascending: true }).range(from, to);

    if (filtro === "confirmado") q = q.eq("confirmado", true);
    if (filtro === "pendente")   q = q.eq("confirmado", false);
    if (orFilter)                q = q.or(orFilter);

    const { data, count } = await q;
    const novas = (data ?? []) as Abastecimento[];

    setLinhas(prev => substituir ? novas : [...prev, ...novas]);
    setTotalCount(count ?? 0);

    if (pag === 0) setLoading(false); else setLoadingMais(false);
    setPagina(pag);
  }

  // ─── KPIs (globais da empresa, como no comportamento original — carregam
  //     uma vez, não a cada busca) ──────────────────────────────────────────
  useEffect(() => {
    if (!empresaId) return;
    const eid = empresaId;
    const supabase = createClient();
    const carregarKpis = async () => {
      const { count } = await supabase
        .from("abastecimentos")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", eid);
      setKpiCount(count ?? 0);

      // soma precisa de todas as linhas; payload mínimo até existir RPC de agregação
      const somaData = await loadAll<{ litros: number; valor_total: number }>((from, to) =>
        supabase
          .from("abastecimentos")
          .select("litros,valor_total")
          .eq("empresa_id", eid)
          .range(from, to)
      );
      setKpiLitros(somaData.reduce((s, a) => s + (a.litros ?? 0), 0));
      setKpiCusto(somaData.reduce((s, a) => s + (a.valor_total ?? 0), 0));
    };
    carregarKpis();
  }, [empresaId]);

  const ticketMedio = (kpiCount != null && kpiCount > 0 && kpiCusto != null)
    ? kpiCusto / kpiCount
    : 0;

  const temMais = totalCount != null ? linhas.length < totalCount : linhas.length >= (pagina + 1) * PAGE_SIZE;

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por veículo, motorista, posto..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtro} onChange={e => setFiltro(e.target.value)}
        style={{ ...selectStyle, width: "140px" }}>
        <option value="">Todos</option>
        <option value="confirmado">Confirmados</option>
        <option value="pendente">Pendentes</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {linhas.length} de {totalCount ?? "..."} registros
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Abastecimentos" count={loading ? undefined : (totalCount ?? undefined)}>
        <Btn href="/abastecimentos/novo" size="sm">+ Registrar Abastecimento</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Total Abastecimentos" value={kpiCount == null ? "..." : kpiCount} />
          <KpiCard label="Total Litros"         value={kpiLitros == null ? "..." : kpiLitros.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " L"} color="info" />
          <KpiCard label="Custo Total"          value={kpiCusto == null ? "..." : kpiCusto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} color="warning" />
          <KpiCard label="Ticket Médio"         value={kpiCusto == null ? "..." : ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} color="success" />
        </div>

        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={linhas.length} label="abastecimentos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th {...thSort("data")}>Data</Th>
              <Th {...thSort("veiculo")}>Veículo</Th>
              <Th {...thSort("motorista")}>Motorista</Th>
              <Th {...thSort("posto")}>Posto</Th>
              <Th style={{ textAlign: "right" }}>KM</Th>
              <Th {...thSort("litros")} style={{ textAlign: "right" }}>Litros</Th>
              <Th style={{ textAlign: "right" }}>Valor/L</Th>
              <Th {...thSort("total")} style={{ textAlign: "right" }}>Total</Th>
              <Th {...thSort("status")}>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : linhas.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  {!busca && !filtro
                    ? <EmptyState message="Nenhum abastecimento registrado." icon="⛽" action={<Btn href="/abastecimentos/novo">+ Registrar primeiro abastecimento</Btn>} />
                    : <EmptyState message="Nenhum abastecimento encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              linhas.map(a => {
                const data = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";
                return (
                  // Linha inteira clicável → edição do abastecimento.
                  // Cliques em button/a/input dentro da linha são ignorados pelo Tr.
                  <Tr key={a.id} onClick={() => router.push(`/abastecimentos/${a.id}/editar`)}>
                    <Td>{data}</Td>
                    <Td>{a.veiculos ? `${a.veiculos.placa} — ${a.veiculos.modelo}` : "—"}</Td>
                    <Td>{a.motoristas?.nome ?? "—"}</Td>
                    <Td>{a.posto ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>{a.km_no_abast?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>{a.litros.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {a.valor_litro != null
                        ? a.valor_litro.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 })
                        : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </Td>
                    <Td>
                      <Badge variant={a.confirmado ? "success" : "warning"}>
                        {a.confirmado ? "Confirmado" : "Pendente"}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/abastecimentos/${a.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={a.id} table="abastecimentos" label="abastecimento" />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        </div>

        {/* Mobile: cards */}
        <MobileList count={linhas.length} label="abastecimentos">
          {loading ? null : linhas.map(a => {
            const data = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";
            return (
              <MobileCard
                key={a.id}
                href={`/abastecimentos/${a.id}/editar`}
                title={a.veiculos ? `${a.veiculos.placa}` : "Sem veículo"}
                subtitle={`${data} • ${a.motoristas?.nome ?? "Sem motorista"}`}
                badge={
                  <Badge variant={a.confirmado ? "success" : "warning"}>
                    {a.confirmado ? "✓" : "Pend."}
                  </Badge>
                }
                details={[
                  { label: "Litros", value: `${a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` },
                  { label: "Total", value: a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
                ]}
              />
            );
          })}
        </MobileList>

        {/* Botão "Carregar mais" — desktop e mobile */}
        {!loading && temMais && (
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
            <Btn
              variant="outline"
              size="sm"
              onClick={() => buscarPagina(pagina + 1, false)}
              disabled={loadingMais}
            >
              {loadingMais ? "Carregando..." : `Carregar mais (${linhas.length} de ${totalCount ?? "?"})`}
            </Btn>
          </div>
        )}

        <MobileFAB href="/abastecimentos/novo" label="Registrar Abastecimento" />
      </div>
    </div>
  );
}

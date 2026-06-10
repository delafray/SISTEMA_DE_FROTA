"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizar } from "@/lib/utils/normalizar";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn,
  KpiCard, EmptyState, SearchInput, selectStyle,
} from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type EntregaLite = {
  id: string;
  destino: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string; apelido: string | null } | null;
};

type Pedido = {
  id: string;
  status: string;
  valor_pedido: number | null;
  created_at: string | null;
  data_inicio_prevista: string | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; apelido: string | null; modelo: string } | null;
  entregas: EntregaLite[];
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

const fmtDataCadastro = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const fmtMoeda = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—";

/** Normaliza embed que o PostgREST às vezes devolve como array. */
function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}

/** Nome do cliente do pedido — vem das entregas (cadastrado ou avulso). */
function clienteDoPedido(p: Pedido): string {
  const entregas = Array.isArray(p.entregas) ? p.entregas : [];
  for (const e of entregas) {
    const cli = one(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

/** Pega um rótulo curto e legível de um destino (\"Rua X, 123 - Centro\" → \"Centro\" ou começo). */
function rotuloDestino(destino: string): string {
  const txt = destino.trim();
  const partes = txt.split(",").map(s => s.trim()).filter(Boolean);
  const alvo = partes.length >= 2 ? partes[partes.length - 1] : partes[0] ?? txt;
  return alvo.length > 22 ? alvo.slice(0, 21) + "…" : alvo;
}

/** Resumo dos destinos: \"3 entregas · Centro / Jardim +1\". */
function resumoDestinos(entregas: EntregaLite[]): string {
  const dests = entregas.map(e => e.destino?.trim()).filter((d): d is string => !!d);
  const n = entregas.length;
  const palavra = n === 1 ? "entrega" : "entregas";
  if (dests.length === 0) return `${n} ${palavra}`;
  const rotulos = dests.slice(0, 2).map(rotuloDestino);
  const extra = dests.length > 2 ? ` +${dests.length - 2}` : "";
  return `${n} ${palavra} · ${rotulos.join(" / ")}${extra}`;
}

/** Paginação: 100 registros por página, filtro de status no servidor,
 *  busca por texto client-side nos 100 da página atual.
 *  Regra dos 10.000+ pedidos (doc 09/06): evita carregar tudo de uma vez. */
const PAGE_SIZE = 100;

export default function PedidosListPage() {
  const router = useRouter();

  // Estado de paginação e dados
  const [pagina, setPagina]     = useState(0);
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [total, setTotal]       = useState<number>(0);
  const [loading, setLoading]   = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  // Filtros
  const [busca, setBusca]   = useState("");
  const [filtro, setFiltro] = useState("");
  const buscaDeferred = useDeferredValue(busca);
  // Busca aplicada no SERVIDOR (regra do CLAUDE.md) — debounce de 350ms
  const [buscaServidor, setBuscaServidor] = useState("");

  // KPIs globais por status (head-count; não dependem da página visível)
  const [kpiAgendadas, setKpiAgendadas]   = useState<number | null>(null);
  const [kpiAndamento, setKpiAndamento]   = useState<number | null>(null);
  const [kpiConcluidas, setKpiConcluidas] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaServidor(busca); setPagina(0); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  // ── Carrega empresa do usuário uma única vez ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (ue?.empresa_id) setEmpresaId(ue.empresa_id as string);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carrega página do servidor sempre que pagina/filtro/busca/empresa muda ──
  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const from = pagina * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      // Busca no SERVIDOR: ilike não funciona em join nem em uuid, então
      // prefetch dos IDs que casam (cadastros pequenos + entregas por termo)
      // e filtra a query principal com .or(in). Regra de listagens do CLAUDE.md.
      let orBusca: string | null = null;
      const termo = buscaServidor.replace(/[%,()]/g, "").trim();
      if (termo) {
        const like = `%${termo}%`;
        const [mots, veics, clis, entsTexto] = await Promise.all([
          supabase.from("motoristas").select("id").eq("empresa_id", empresaId).ilike("nome", like).limit(200),
          supabase.from("veiculos").select("id").eq("empresa_id", empresaId)
            .or(`placa.ilike.${like},apelido.ilike.${like},modelo.ilike.${like}`).limit(200),
          supabase.from("clientes").select("id").eq("empresa_id", empresaId)
            .or(`nome_fantasia.ilike.${like},apelido.ilike.${like}`).limit(200),
          supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
            .or(`destino.ilike.${like},nome_cliente_avulso.ilike.${like}`)
            .not("pedido_id", "is", null).limit(500),
        ]);
        const cliIds = (clis.data ?? []).map(c => c.id);
        // entregas de clientes cadastrados que casaram com o termo → pedido_ids
        const entsCli = cliIds.length > 0
          ? await supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
              .in("cliente_id", cliIds).not("pedido_id", "is", null).limit(500)
          : { data: [] as { pedido_id: string }[] };
        const pedidoIds = Array.from(new Set([
          ...(entsTexto.data ?? []).map(e => e.pedido_id),
          ...(entsCli.data ?? []).map(e => e.pedido_id),
        ].filter(Boolean)));
        const motIds  = (mots.data ?? []).map(m => m.id);
        const veicIds = (veics.data ?? []).map(v => v.id);

        const partes: string[] = [];
        if (pedidoIds.length > 0) partes.push(`id.in.(${pedidoIds.join(",")})`);
        if (motIds.length > 0)    partes.push(`motorista_id.in.(${motIds.join(",")})`);
        if (veicIds.length > 0)   partes.push(`veiculo_id.in.(${veicIds.join(",")})`);
        if (partes.length === 0) {
          // termo não casou nada em lugar nenhum → resultado vazio sem consultar
          setPedidos([]); setTotal(0); setLoading(false);
          return;
        }
        orBusca = partes.join(",");
      }

      let q = supabase
        .from("pedidos")
        .select(
          "id,status,valor_pedido,created_at,data_inicio_prevista,motoristas(nome),veiculos(placa,apelido,modelo),entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia,apelido))",
          { count: "exact" }
        )
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

      if (filtro) q = q.eq("status", filtro);
      if (orBusca) q = q.or(orBusca);

      const { data, count } = await (q as unknown as Promise<{ data: Pedido[] | null; count: number | null }>);
      setPedidos(data ?? []);
      setTotal(count ?? 0);
      setLoading(false);
    };
    load();
  }, [empresaId, pagina, filtro, buscaServidor]);

  // ── KPIs globais por status (head-count; corretos em qualquer página) ─────
  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    const contar = (statuses: string[]) =>
      supabase.from("pedidos").select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId).in("status", statuses);
    Promise.all([
      contar(["agendada", "agendado"]),
      contar(["em_andamento"]),
      contar(["concluida", "concluido"]),
    ]).then(([ag, an, co]) => {
      setKpiAgendadas(ag.count ?? 0);
      setKpiAndamento(an.count ?? 0);
      setKpiConcluidas(co.count ?? 0);
    });
  }, [empresaId]);

  // Ao mudar o filtro de status, volta para a primeira página
  useEffect(() => { setPagina(0); }, [filtro]);

  // ── Refinamento client-side instantâneo (a busca REAL roda no servidor
  //    via buscaServidor; isto só filtra a página atual enquanto digita) ──────
  const indexado = useMemo(() =>
    pedidos.map(p => {
      const entregas = Array.isArray(p.entregas) ? p.entregas : [];
      const motorista = one(p.motoristas);
      const veiculo   = one(p.veiculos);
      const cliente   = clienteDoPedido(p);
      const hay = normalizar([
        cliente,
        ...entregas.map(e => e.destino ?? ""),
        ...entregas.map(e => e.nome_cliente_avulso ?? ""),
        motorista?.nome ?? "",
        veiculo?.placa ?? "",
        veiculo?.apelido ?? "",
        veiculo?.modelo ?? "",
      ].join(" "));
      return { p, cliente, motorista, veiculo, entregas, hay };
    }),
  [pedidos]);

  const filtradas = useMemo(() => {
    const q = normalizar(buscaDeferred);
    if (!q) return indexado;
    return indexado.filter(row => row.hay.includes(q));
  }, [indexado, buscaDeferred]);

  // ── KPIs — total da query atual + contagens GLOBAIS por status (head-count) ─
  const kpis = useMemo(() => ({
    total:      total,
    agendadas:  kpiAgendadas ?? "...",
    andamento:  kpiAndamento ?? "...",
    concluidas: kpiConcluidas ?? "...",
  }), [total, kpiAgendadas, kpiAndamento, kpiConcluidas]);

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  // ── Controles de paginação (reutilizáveis) ────────────────────────────────
  const Paginacao = ({ mobile = false }: { mobile?: boolean }) =>
    totalPaginas > 1 ? (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        justifyContent: mobile ? "center" : "flex-end",
        padding: "8px 0",
      }}>
        {!mobile && (
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            Página {pagina + 1} de {totalPaginas} &nbsp;·&nbsp; {total} pedidos
          </span>
        )}
        <Btn
          variant="outline" size={mobile ? "sm" : "xs"}
          disabled={pagina === 0 || loading}
          onClick={() => setPagina(p => Math.max(0, p - 1))}
        >
          ← Anterior
        </Btn>
        {mobile && (
          <span style={{ fontSize: "13px", color: "#64748b" }}>{pagina + 1}/{totalPaginas}</span>
        )}
        <Btn
          variant="outline" size={mobile ? "sm" : "xs"}
          disabled={pagina >= totalPaginas - 1 || loading}
          onClick={() => setPagina(p => p + 1)}
        >
          Próxima →
        </Btn>
      </div>
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Pedidos"
        count={total}
        actions={<Btn href="/pedidos/novo">+ Novo Pedido</Btn>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <KpiCard label="Total"        value={kpis.total}      />
          <KpiCard label="Agendados"    value={kpis.agendadas}  color="warning" />
          <KpiCard label="Em Andamento" value={kpis.andamento}  color="info" />
          <KpiCard label="Concluídos"   value={kpis.concluidas} color="success" />
        </div>

        {/* ── Tabela Desktop ─────────────────────────────────────────────── */}
        <div className="m-hide">
          <DataTable
            toolbar={
              <>
                <SearchInput
                  placeholder="Buscar por cliente ou destino..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
                <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...selectStyle, width: "160px" }}>
                  <option value="">Todos os status</option>
                  <option value="agendada">Agendado</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluida">Concluído</option>
                  <option value="cancelada">Cancelado</option>
                </select>
              </>
            }
          >
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Cadastrado em</Th>
                <Th>Destinos</Th>
                <Th>Valor (R$)</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>Carregando...</Td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={6}><EmptyState message="Nenhum pedido encontrado" action={<Btn href="/pedidos/novo">Criar primeiro pedido</Btn>} /></td></tr>
              ) : filtradas.map(({ p, cliente, motorista, veiculo, entregas }) => {
                const veicLabel = veiculo ? (veiculo.apelido?.trim() || `${veiculo.placa} · ${veiculo.modelo}`) : null;
                return (
                  <Tr key={p.id}>
                    <Td>
                      <div style={{ fontWeight: 600, color: "#1e293b" }}>{cliente}</div>
                      {(motorista || veicLabel) && (
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          {[motorista?.nome, veicLabel].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </Td>
                    <Td>{fmtDataCadastro(p.created_at)}</Td>
                    <Td style={{ maxWidth: "260px" }}>
                      <span style={{ color: "#475569" }}>{resumoDestinos(entregas)}</span>
                    </Td>
                    <Td style={{ textAlign: "right" }}>{fmtMoeda(p.valor_pedido)}</Td>
                    <Td><Badge variant={STATUS_VAR[p.status] ?? "default"}>{STATUS_LABEL[p.status] ?? p.status}</Badge></Td>
                    <Td>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        <Btn href={`/pedidos/${p.id}`}       variant="ghost"   size="xs">Ver</Btn>
                        <Btn href={`/pedidos/${p.id}/editar`} variant="outline" size="xs">Editar</Btn>
                        <DeleteBtn id={p.id} table="pedidos" label="pedido" />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          <Paginacao />
        </div>

        {/* ── Busca Mobile ────────────────────────────────────────────────── */}
        <div className="mobile-only" style={{ marginBottom: "4px" }}>
          <SearchInput
            placeholder="Buscar por cliente ou destino..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        <MobileList count={filtradas.length} label="pedidos">
          {loading ? null : filtradas.map(({ p, cliente, motorista, veiculo, entregas }) => {
            const concluido   = p.status === "concluida" || p.status === "concluido";
            const cancelado   = p.status === "cancelada" || p.status === "cancelado";
            const statusColor = concluido ? "#16a34a" : p.status === "em_andamento" ? "#2563eb" : cancelado ? "#ef4444" : "#eab308";
            const veicLabel   = veiculo ? (veiculo.apelido?.trim() || `${veiculo.placa} • ${veiculo.modelo}`) : "Sem veículo";
            return (
              <MobileCard
                key={p.id}
                href={`/pedidos/${p.id}`}
                title={cliente}
                subtitle={resumoDestinos(entregas)}
                badge={<Badge variant={STATUS_VAR[p.status] ?? "default"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>}
                highlight={statusColor}
                details={[
                  { label: "Cadastrado", value: fmtDataCadastro(p.created_at) },
                  { label: "Valor",      value: p.valor_pedido != null ? `R$ ${fmtMoeda(p.valor_pedido)}` : "—" },
                  { label: "Motorista",  value: motorista?.nome ?? "—" },
                  { label: "Veículo",    value: veicLabel },
                ]}
              />
            );
          })}
        </MobileList>
        <div className="mobile-only"><Paginacao mobile /></div>

        <MobileFAB href="/pedidos/novo" label="Novo Pedido" />
      </div>
    </div>
  );
}

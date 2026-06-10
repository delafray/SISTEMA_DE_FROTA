"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizar } from "@/lib/utils/normalizar";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn,
  KpiCard, EmptyState, selectStyle, Alert, FormField, SearchInput,
} from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";
import { ModalDespacho } from "./_components/ModalDespacho";

// ─── Tipos ──────────────────────────────────────────────────────────────────────

type EntregaLite = {
  id: string;
  destino: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string } | null;
};

type Pedido = {
  id: string;
  status: string;
  valor_pedido: number | null;
  created_at: string | null;
  data_inicio_prevista: string | null;
  veiculo_id?: string | null;
  motorista_id?: string | null;
  entregas: EntregaLite[];
  motoristas?: { nome: string } | null;
  veiculos?: { placa: string; apelido: string | null; modelo: string } | null;
};

type Veiculo = {
  id: string;
  placa: string;
  apelido: string | null;
  marca: string;
  modelo: string;
};

type Motorista = {
  id: string;
  nome: string;
};

type Aba = "fila" | "despachados";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_FINALIZADOS = ["concluido", "concluida", "cancelado", "cancelada"];

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

/** A constraint `viagens_status_check` só aceita as formas FEMININAS. Pedidos
 *  antigos podem ter status masculino ('agendado'), e o Postgres RE-VALIDA o
 *  CHECK em QUALQUER update da linha (mesmo sem mexer no status) → o despacho
 *  estourava. Normalizamos pra forma feminina no próprio update do despacho. */
const STATUS_FEMININO: Record<string, string> = {
  agendado: "agendada", concluido: "concluida", cancelado: "cancelada",
};
const normalizarStatus = (s: string) => STATUS_FEMININO[s] ?? s;

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const fmtMoeda = (v: number | null) =>
  v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";


/** Erro do Supabase em linguagem legível: mostra message + details + hint + code. */
function fmtErroSupabase(e: any, contexto: string): string {
  const partes = [e?.message, e?.details, e?.hint].filter(Boolean);
  const cod = e?.code ? ` [${e.code}]` : "";
  return `${contexto}: ${partes.join(" — ") || "erro desconhecido"}${cod}`;
}

function one<T>(x: any): T | null { return Array.isArray(x) ? (x[0] ?? null) : (x ?? null); }

/** Cliente do pedido — vem das entregas (cadastrado ou avulso). */
function clienteDoPedido(entregas: EntregaLite[]): string {
  for (const e of entregas) {
    const cli = one<{ nome_fantasia: string }>(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

function rotuloDestino(destino: string): string {
  const partes = destino.trim().split(",").map(s => s.trim()).filter(Boolean);
  const alvo = partes.length >= 2 ? partes[partes.length - 1] : partes[0] ?? destino;
  return alvo.length > 22 ? alvo.slice(0, 21) + "…" : alvo;
}

/** "3 entregas · Centro / Jardim +1" */
function resumoDestinos(entregas: EntregaLite[]): string {
  const dests = entregas.map(e => e.destino?.trim()).filter((d): d is string => !!d);
  const n = entregas.length;
  const palavra = n === 1 ? "entrega" : "entregas";
  if (dests.length === 0) return `${n} ${palavra}`;
  const rotulos = dests.slice(0, 2).map(rotuloDestino);
  const extra = dests.length > 2 ? ` +${dests.length - 2}` : "";
  return `${n} ${palavra} · ${rotulos.join(" / ")}${extra}`;
}

// ─── Página Principal ─────────────────────────────────────────────────────────

/** Paginação: 100 pedidos por página na fila de despacho.
 *  Regra dos 10.000+ pedidos (doc 09/06): evita carregar tudo de uma vez. */
const PAGE_SIZE_DESPACHO = 100;

export default function DespachoPage() {
  const router = useRouter();
  const supabase = createClient();

  // ── Abas ────────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<Aba>("fila");

  // Contagens de cada aba (cabeçalho)
  const [contFila, setContFila]             = useState<number | null>(null);
  const [contDespachados, setContDespachados] = useState<number | null>(null);

  // Dados paginados
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [total, setTotal]           = useState(0);
  const [pagina, setPagina]         = useState(0);
  const [veiculos, setVeiculos]     = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading]       = useState(true);
  const [empresaId, setEmpresaId]   = useState<string | null>(null);

  // Busca — aplicada no SERVIDOR (regra do CLAUDE.md), com debounce de 350ms
  const [busca, setBusca] = useState("");
  const buscaDeferred = useDeferredValue(busca);
  const [buscaServidor, setBuscaServidor] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setBuscaServidor(busca); setPagina(0); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Seleção múltipla (apenas na aba Fila)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Modal
  const [modalAberto, setModalAberto]       = useState(false);
  const [modalPedidosIds, setModalPedidosIds] = useState<string[]>([]);
  const [modalModoTroca, setModalModoTroca]   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [modalErr, setModalErr]             = useState("");
  const [sucesso, setSucesso]               = useState("");

  // ── Carrega empresa do usuário (uma vez) ──────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const { data: ue } = await supabase
        .from("usuario_empresas")
        .select("empresa_id")
        .eq("usuario_id", auth.user.id)
        .eq("is_padrao", true)
        .single();
      if (!ue?.empresa_id) return;

      const eId = ue.empresa_id as string;
      setEmpresaId(eId);

      // Caminhões e motoristas — carregados uma única vez (raramente mudam)
      const [{ data: veicData }, { data: motData }] = await Promise.all([
        supabase.from("veiculos").select("id,placa,apelido,marca,modelo")
          .eq("empresa_id", eId).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome")
          .eq("empresa_id", eId).eq("ativo", true).order("nome"),
      ]);
      setVeiculos((veicData ?? []) as Veiculo[]);
      setMotoristas((motData ?? []) as Motorista[]);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Contagens de cada aba (head queries, sem baixar linhas) ───────────────

  const carregarContagens = async (eId: string) => {
    const [{ count: cFila }, { count: cDesp }] = await Promise.all([
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", eId)
        .is("veiculo_id", null)
        .not("status", "in", `(${STATUS_FINALIZADOS.join(",")})`),
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", eId)
        .not("veiculo_id", "is", null)
        .not("status", "in", `(${STATUS_FINALIZADOS.join(",")})`),
    ]);
    setContFila(cFila ?? 0);
    setContDespachados(cDesp ?? 0);
  };

  useEffect(() => {
    if (!empresaId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarContagens(empresaId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // ── Carrega página de pedidos (reexecuta ao mudar pagina, empresa ou aba) ──

  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      setLoading(true);
      const from = pagina * PAGE_SIZE_DESPACHO;
      const to   = from + PAGE_SIZE_DESPACHO - 1;

      // Busca no SERVIDOR: o termo casa cliente/destino/nome avulso, que moram
      // nas ENTREGAS — prefetch dos pedido_ids que casam e filtra com .in().
      // (ilike não funciona em join; regra de listagens do CLAUDE.md.)
      let idsBusca: string[] | null = null;
      const termo = buscaServidor.replace(/[%,()]/g, "").trim();
      if (termo) {
        const like = `%${termo}%`;
        const [entsTexto, clis] = await Promise.all([
          supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
            .or(`destino.ilike.${like},nome_cliente_avulso.ilike.${like}`)
            .not("pedido_id", "is", null).limit(500),
          supabase.from("clientes").select("id").eq("empresa_id", empresaId)
            .or(`nome_fantasia.ilike.${like},apelido.ilike.${like}`).limit(200),
        ]);
        const cliIds = (clis.data ?? []).map(c => c.id);
        const entsCli = cliIds.length > 0
          ? await supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
              .in("cliente_id", cliIds).not("pedido_id", "is", null).limit(500)
          : { data: [] as { pedido_id: string }[] };
        idsBusca = Array.from(new Set([
          ...(entsTexto.data ?? []).map(e => e.pedido_id),
          ...(entsCli.data ?? []).map(e => e.pedido_id),
        ].filter((x): x is string => !!x)));
        if (idsBusca.length === 0) {
          setPedidos([]); setTotal(0); setLoading(false);
          return;
        }
      }

      // Monta query conforme aba
      let selectFields =
        "id,status,valor_pedido,created_at,data_inicio_prevista,entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia))";
      if (aba === "despachados") {
        selectFields =
          "id,status,valor_pedido,created_at,data_inicio_prevista,veiculo_id,motorista_id,motoristas(nome),veiculos(placa,apelido,modelo),entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia))";
      }

      let q = supabase
        .from("pedidos")
        .select(selectFields, { count: "exact" })
        .eq("empresa_id", empresaId)
        .not("status", "in", `(${STATUS_FINALIZADOS.join(",")})`);

      if (aba === "fila") {
        q = q.is("veiculo_id", null);
      } else {
        q = q.not("veiculo_id", "is", null);
      }

      if (idsBusca) q = q.in("id", idsBusca);

      const { data, count } = await (q
        .order("data_inicio_prevista", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as Promise<{ data: Pedido[] | null; count: number | null }>);

      setPedidos(data ?? []);
      setTotal(count ?? 0);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pagina, buscaServidor, aba]);

  // ── Trocar aba ────────────────────────────────────────────────────────────

  const trocarAba = (novaAba: Aba) => {
    if (novaAba === aba) return;
    setAba(novaAba);
    setPagina(0);
    setSelecionados(new Set());
    setBusca("");
    setBuscaServidor("");
  };

  // ── Refinamento client-side instantâneo (a busca REAL roda no servidor via
  //    buscaServidor; isto só filtra a página atual enquanto digita) ───────────

  const pedidosIndexados = useMemo(() =>
    pedidos.map(p => {
      const entregas = Array.isArray(p.entregas) ? p.entregas : [];
      const cliente = clienteDoPedido(entregas);
      const hay = normalizar([
        cliente,
        ...entregas.map(e => e.destino ?? ""),
        ...entregas.map(e => e.nome_cliente_avulso ?? ""),
      ].join(" "));
      return { p, entregas, cliente, hay };
    }),
  [pedidos]);

  const filtrados = useMemo(() => {
    const q = normalizar(buscaDeferred);
    const lista = q ? pedidosIndexados.filter(r => r.hay.includes(q)) : pedidosIndexados;
    return [...lista].sort((a, b) => {
      const da = a.p.data_inicio_prevista, db = b.p.data_inicio_prevista;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [pedidosIndexados, buscaDeferred]);

  // ── Seleção ────────────────────────────────────────────────────────────────

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const idsVisiveis = filtrados.map(r => r.p.id);
  const todosSelecionados = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id));

  const toggleTodos = () => {
    if (todosSelecionados) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(idsVisiveis));
    }
  };

  // ── Abrir modal ────────────────────────────────────────────────────────────

  const abrirModal = (ids: string[], troca = false) => {
    setModalPedidosIds(ids);
    setModalModoTroca(troca);
    setModalErr("");
    setModalAberto(true);
  };

  // ── Confirmar despacho (novo despacho OU troca) ────────────────────────────

  const confirmarDespacho = async (veiculoId: string, motoristaId: string) => {
    setSaving(true);
    setModalErr("");

    try {
      // Snapshots: empresa do veículo (obrigatória) e empresa do motorista.
      const [empresa_id, empresa_motorista_id] = await Promise.all([
        empresaDoVeiculo(supabase, veiculoId),
        empresaDoMotorista(supabase, motoristaId),
      ]);

      if (!empresa_id) {
        setModalErr("Caminhão sem empresa definida. Verifique o cadastro do caminhão.");
        setSaving(false);
        return;
      }

      if (modalModoTroca) {
        // ── MODO TROCA: apenas veículo/motorista, NÃO mexe no status ──────────
        const pedidoPayload: any = {
          veiculo_id:           veiculoId,
          motorista_id:         motoristaId,
          empresa_motorista_id: empresa_motorista_id,
        };
        const { error: errPedido } = await supabase
          .from("pedidos")
          .update(pedidoPayload)
          .in("id", modalPedidosIds);

        if (errPedido) {
          setModalErr(fmtErroSupabase(errPedido, "Erro ao trocar caminhão/motorista"));
          setSaving(false);
          return;
        }

        // Propaga às entregas
        const entregaPayload: any = { veiculo_id: veiculoId, motorista_id: motoristaId };
        const { error: errEntregas } = await supabase
          .from("entregas")
          .update(entregaPayload)
          .in("pedido_id", modalPedidosIds);

        if (errEntregas) {
          setModalErr(fmtErroSupabase(errEntregas, "Pedido atualizado, mas houve erro ao atualizar as entregas"));
          setSaving(false);
          return;
        }

        // Atualiza linha localmente (sem reload) — busca veículo/motorista da lista
        const vObj = veiculos.find(v => v.id === veiculoId);
        const mObj = motoristas.find(m => m.id === motoristaId);
        setPedidos(prev => prev.map(p => {
          if (!modalPedidosIds.includes(p.id)) return p;
          return {
            ...p,
            veiculo_id: veiculoId,
            motorista_id: motoristaId,
            veiculos: vObj ? { placa: vObj.placa, apelido: vObj.apelido, modelo: vObj.modelo } : p.veiculos,
            motoristas: mObj ? { nome: mObj.nome } : p.motoristas,
          };
        }));

        setModalAberto(false);
        setSucesso("Caminhão/motorista trocados com sucesso!");
        setTimeout(() => setSucesso(""), 4000);

        // Atualiza contagens (a troca não muda os totais de fila/despachados)
      } else {
        // ── MODO DESPACHO NORMAL ──────────────────────────────────────────────

        // Agrupa os pedidos por status JÁ NORMALIZADO (feminino), pra gravar um
        // status válido na mesma operação e não tropeçar na constraint.
        const statusPorId = new Map(pedidos.map(p => [p.id, normalizarStatus(p.status)]));
        const grupos = new Map<string, string[]>();
        for (const pid of modalPedidosIds) {
          const st = statusPorId.get(pid) ?? "agendada";
          if (!grupos.has(st)) grupos.set(st, []);
          grupos.get(st)!.push(pid);
        }

        for (const [statusNorm, ids] of grupos) {
          const pedidoPayload: any = {
            veiculo_id:           veiculoId,
            motorista_id:         motoristaId,
            empresa_motorista_id: empresa_motorista_id,
            status:               statusNorm, // normaliza gênero → constraint feliz
          };
          const { error: errPedidos } = await supabase
            .from("pedidos")
            .update(pedidoPayload)
            .in("id", ids);

          if (errPedidos) {
            setModalErr(fmtErroSupabase(errPedidos, "Erro ao despachar o pedido"));
            setSaving(false);
            return;
          }
        }

        // Atualiza entregas dos pedidos despachados (caminhão + motorista).
        const entregaPayload: any = { veiculo_id: veiculoId, motorista_id: motoristaId };
        const { error: errEntregas } = await supabase
          .from("entregas")
          .update(entregaPayload)
          .in("pedido_id", modalPedidosIds);

        if (errEntregas) {
          setModalErr(fmtErroSupabase(errEntregas, "Pedido despachado, mas houve erro ao atualizar as entregas"));
          setSaving(false);
          return;
        }

        // Remove da fila local (sem reload de página)
        setPedidos(prev => prev.filter(p => !modalPedidosIds.includes(p.id)));
        setTotal(prev => Math.max(0, prev - modalPedidosIds.length));
        setSelecionados(new Set());
        setModalAberto(false);

        const qtd = modalPedidosIds.length;
        setSucesso(
          qtd === 1
            ? "Pedido despachado com sucesso!"
            : `${qtd} pedidos despachados com sucesso!`
        );
        setTimeout(() => setSucesso(""), 4000);

        // Refresca contagens após despacho
        if (empresaId) carregarContagens(empresaId);
      }
    } catch (e) {
      setModalErr(fmtErroSupabase(e, "Erro inesperado"));
    } finally {
      setSaving(false);
    }
  };

  // ── KPIs e controles ───────────────────────────────────────────────────────

  const totalAguardando  = total;
  const totalPaginas     = Math.ceil(total / PAGE_SIZE_DESPACHO);
  const algumselecionado = aba === "fila" && selecionados.size > 0;

  // Rótulos das abas
  const labelFila        = contFila        != null ? `Fila (${contFila})`               : "Fila";
  const labelDespachados = contDespachados != null ? `Despachados (${contDespachados})` : "Despachados";

  // Controles de paginação (reutilizáveis desktop/mobile)
  const Paginacao = ({ mobile = false }: { mobile?: boolean }) =>
    totalPaginas > 1 ? (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        justifyContent: mobile ? "center" : "flex-end",
        padding: "8px 0",
      }}>
        {!mobile && (
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            Página {pagina + 1} de {totalPaginas} · {total} {aba === "fila" ? "aguardando" : "despachados"}
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Despacho"
        subtitle={aba === "fila" ? "Fila de pedidos aguardando caminhão e motorista" : "Pedidos já despachados"}
        count={totalAguardando}
        actions={
          algumselecionado ? (
            <Btn
              variant="primary"
              onClick={() => abrirModal(Array.from(selecionados))}
            >
              Despachar {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </Btn>
          ) : undefined
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        {/* Abas pill */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(["fila", "despachados"] as Aba[]).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => trocarAba(a)}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                border: aba === a ? "none" : "1px solid #cbd5e1",
                background: aba === a ? "#2563eb" : "#fff",
                color: aba === a ? "#fff" : "#475569",
                transition: "all 0.15s",
              }}
            >
              {a === "fila" ? labelFila : labelDespachados}
            </button>
          ))}
        </div>

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", maxWidth: "320px" }}>
          <KpiCard
            label={aba === "fila" ? "Aguardando Despacho" : "Despachados (ativos)"}
            value={loading ? "..." : totalAguardando}
            color={aba === "fila" ? "warning" : "info"}
          />
        </div>

        {/* Alerta de sucesso */}
        {sucesso && (
          <Alert variant="success">{sucesso}</Alert>
        )}

        {/* Busca no mobile */}
        <div className="mobile-only" style={{ marginBottom: "4px" }}>
          <SearchInput
            placeholder="Buscar por cliente ou destino..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {/* Tabela Desktop */}
        <div className="m-hide">
          <DataTable
            count={filtrados.length}
            label={aba === "fila" ? "pedidos aguardando despacho" : "pedidos despachados"}
            toolbar={
              <>
                <SearchInput
                  placeholder="Buscar por cliente ou destino..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
                {/* Botão de despachar múltiplos — só na aba Fila */}
                {aba === "fila" && algumselecionado && (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={() => abrirModal(Array.from(selecionados))}
                  >
                    Despachar {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
                  </Btn>
                )}
              </>
            }
          >
            <thead>
              <tr>
                {/* Checkbox só na aba Fila */}
                {aba === "fila" && (
                  <Th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={toggleTodos}
                      style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                      title="Selecionar todos"
                    />
                  </Th>
                )}
                <Th>Cliente</Th>
                <Th>Data Prevista</Th>
                <Th>Destinos</Th>
                {aba === "despachados" && <Th>Caminhão / Motorista</Th>}
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={aba === "fila" ? 7 : 7} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                    Carregando...
                  </Td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={aba === "fila" ? 7 : 7}>
                    <EmptyState
                      icon="🚚"
                      message={
                        busca
                          ? "Nenhum pedido encontrado para essa busca."
                          : aba === "fila"
                            ? "Nenhum pedido aguardando despacho. Lance um pedido primeiro."
                            : "Nenhum pedido despachado no momento."
                      }
                      action={busca ? undefined : aba === "fila" ? <Btn href="/pedidos/novo">Criar Novo Pedido</Btn> : undefined}
                    />
                  </td>
                </tr>
              ) : filtrados.map(({ p, entregas, cliente }) => {
                const sel = aba === "fila" && selecionados.has(p.id);
                // Dados do veículo/motorista para aba Despachados
                const veicObj = one<{ placa: string; apelido: string | null; modelo: string }>(p.veiculos);
                const motObj  = one<{ nome: string }>(p.motoristas);
                const veicLabel = veicObj
                  ? (veicObj.apelido?.trim() ? `${veicObj.apelido} (${veicObj.placa})` : `${veicObj.placa} — ${veicObj.modelo}`)
                  : "—";
                const motLabel = motObj?.nome ?? "—";

                return (
                  <Tr
                    key={p.id}
                    style={{ background: sel ? "#eff6ff" : undefined }}
                  >
                    {/* Checkbox só na aba Fila */}
                    {aba === "fila" && (
                      <Td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleSelecionado(p.id)}
                          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                        />
                      </Td>
                    )}
                    <Td style={{ fontWeight: 600, color: "#1e293b" }}>{cliente}</Td>
                    <Td>{fmtDate(p.data_inicio_prevista)}</Td>
                    <Td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resumoDestinos(entregas)}
                    </Td>
                    {aba === "despachados" && (
                      <Td style={{ fontSize: "12px", color: "#475569" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{veicLabel}</div>
                        <div>{motLabel}</div>
                      </Td>
                    )}
                    <Td style={{ textAlign: "right" }}>{fmtMoeda(p.valor_pedido)}</Td>
                    <Td>
                      <Badge variant={STATUS_VAR[p.status] ?? "default"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        <Btn href={`/pedidos/${p.id}`} variant="ghost" size="xs">Ver</Btn>
                        {aba === "fila" ? (
                          <>
                            <Btn
                              variant="primary"
                              size="xs"
                              onClick={() => abrirModal([p.id])}
                            >
                              Despachar
                            </Btn>
                            <Btn
                              href={`/pedidos/importar?pedido_id=${p.id}`}
                              variant="ghost"
                              size="xs"
                              title="Importar notas (XML) para este pedido"
                            >
                              📥 Notas
                            </Btn>
                          </>
                        ) : (
                          <Btn
                            variant="outline"
                            size="xs"
                            onClick={() => abrirModal([p.id], true)}
                          >
                            Trocar
                          </Btn>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          <Paginacao />
        </div>

        {/* Lista Mobile */}
        <MobileList
          count={filtrados.length}
          label={aba === "fila" ? "pedidos aguardando despacho" : "pedidos despachados"}
          emptyMessage={aba === "fila" ? "Nenhum pedido aguardando despacho." : "Nenhum pedido despachado."}
          emptyIcon="🚚"
        >
          {loading ? null : filtrados.map(({ p, entregas, cliente }) => {
            const sel = aba === "fila" && selecionados.has(p.id);
            const veicObj = one<{ placa: string; apelido: string | null; modelo: string }>(p.veiculos);
            const motObj  = one<{ nome: string }>(p.motoristas);
            const veicLabel = veicObj
              ? (veicObj.apelido?.trim() ? `${veicObj.apelido} (${veicObj.placa})` : `${veicObj.placa} — ${veicObj.modelo}`)
              : null;

            return (
              <MobileCard
                key={p.id}
                title={cliente}
                subtitle={resumoDestinos(entregas)}
                badge={
                  <Badge variant={STATUS_VAR[p.status] ?? "default"}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                }
                highlight={sel ? "#2563eb" : "#e2e8f0"}
                details={[
                  { label: "Previsto", value: fmtDate(p.data_inicio_prevista) },
                  { label: "Valor",    value: fmtMoeda(p.valor_pedido) },
                  ...(aba === "despachados" && veicLabel ? [{ label: "Caminhão", value: veicLabel }] : []),
                  ...(aba === "despachados" && motObj?.nome ? [{ label: "Motorista", value: motObj.nome }] : []),
                ]}
                actions={
                  aba === "fila" ? (
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <Btn href={`/pedidos/${p.id}`} variant="outline" size="sm">Ver</Btn>
                      <Btn
                        variant="primary"
                        size="sm"
                        onClick={() => abrirModal([p.id])}
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        Despachar
                      </Btn>
                      <Btn
                        href={`/pedidos/importar?pedido_id=${p.id}`}
                        variant="ghost"
                        size="sm"
                        title="Importar notas (XML)"
                      >
                        📥
                      </Btn>
                      <Btn
                        variant={sel ? "outline" : "ghost"}
                        size="sm"
                        onClick={() => toggleSelecionado(p.id)}
                      >
                        {sel ? "Tirar" : "Marcar"}
                      </Btn>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <Btn href={`/pedidos/${p.id}`} variant="outline" size="sm">Ver</Btn>
                      <Btn
                        variant="outline"
                        size="sm"
                        onClick={() => abrirModal([p.id], true)}
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        Trocar
                      </Btn>
                    </div>
                  )
                }
              />
            );
          })}
        </MobileList>
        <div className="mobile-only"><Paginacao mobile /></div>

        {/* FAB Mobile para despachar selecionados — só na aba Fila */}
        {algumselecionado && (
          <button
            type="button"
            onClick={() => abrirModal(Array.from(selecionados))}
            className="m-fab mobile-only"
            title={`Despachar ${selecionados.size} selecionado(s)`}
            aria-label={`Despachar ${selecionados.size} selecionado(s)`}
            style={{ fontSize: "12px", width: "auto", padding: "0 16px", borderRadius: "24px" }}
          >
            Despachar {selecionados.size}
          </button>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <ModalDespacho
          pedidosIds={modalPedidosIds}
          veiculos={veiculos}
          motoristas={motoristas}
          onConfirm={confirmarDespacho}
          onClose={() => { if (!saving) setModalAberto(false); }}
          saving={saving}
          err={modalErr}
          modoTroca={modalModoTroca}
        />
      )}
    </div>
  );
}

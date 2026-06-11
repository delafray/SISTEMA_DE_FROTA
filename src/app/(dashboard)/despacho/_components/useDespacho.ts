"use client";

/**
 * Hook centralizado da tela de Despacho.
 * Extrai todo o estado + lógica de dados da page.tsx para manter
 * a page enxuta (<350 linhas), sem mudar comportamento ou visual.
 */

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizar } from "@/lib/utils/normalizar";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import {
  type PedidoDespacho,
  type VeiculoLista,
  type MotoristaLista,
  PAGE_SIZE_DESPACHO,
  STATUS_FINALIZADOS,
  normalizarStatus,
  fmtErroSupabase,
  clienteDoPedido,
} from "./tiposDespacho";

// ─── Tipos do hook ────────────────────────────────────────────────────────────

export type PedidoIndexado = {
  p: PedidoDespacho;
  entregas: PedidoDespacho["entregas"];
  cliente: string;
  hay: string;
};

export type UseDespachoReturn = {
  // Dados
  pedidos: PedidoDespacho[];
  filtrados: PedidoIndexado[];
  veiculos: VeiculoLista[];
  motoristas: MotoristaLista[];
  total: number;
  loading: boolean;
  empresaId: string | null;

  // KPIs
  contFila: number | null;
  contDespachados: number | null;
  contEmRota: number | null;

  // Busca
  busca: string;
  setBusca: (v: string) => void;

  // Paginação
  pagina: number;
  setPagina: React.Dispatch<React.SetStateAction<number>>;
  totalPaginas: number;

  // Seleção
  selecionados: Set<string>;
  toggleSelecionado: (id: string) => void;
  todosSelecionados: boolean;
  toggleTodos: () => void;

  // Modal despacho
  modalAberto: boolean;
  modalPedidosIds: string[];
  modalModoTroca: boolean;
  saving: boolean;
  modalErr: string;
  abrirModal: (ids: string[], troca?: boolean) => void;
  fecharModal: () => void;
  confirmarDespacho: (veiculoId: string, motoristaId: string) => Promise<void>;

  // Modal rota
  modalRota: string | null;
  setModalRota: (id: string | null) => void;

  // Feedback
  sucesso: string;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDespacho(): UseDespachoReturn {
  const router = useRouter();
  const supabase = createClient();

  // SEM FILTROS (decisão do dono 10/06): a lista mostra TUDO — ele vai definir
  // depois quais filtros quer. Sobraram só busca e paginação.

  // Contagens informativas dos KPIs (não filtram nada)
  const [contFila, setContFila]               = useState<number | null>(null);
  const [contDespachados, setContDespachados] = useState<number | null>(null);
  const [contEmRota, setContEmRota]           = useState<number | null>(null);

  // Dados paginados
  const [pedidos, setPedidos]       = useState<PedidoDespacho[]>([]);
  const [total, setTotal]           = useState(0);
  const [pagina, setPagina]         = useState(0);
  const [veiculos, setVeiculos]     = useState<VeiculoLista[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaLista[]>([]);
  const [loading, setLoading]       = useState(true);
  const [empresaId, setEmpresaId]   = useState<string | null>(null);

  // Busca — aplicada no SERVIDOR (regra do CLAUDE.md), com debounce de 350ms
  const [busca, setBusca]                 = useState("");
  const buscaDeferred                     = useDeferredValue(busca);
  const [buscaServidor, setBuscaServidor] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setBuscaServidor(busca); setPagina(0); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Seleção múltipla pra despachar em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Estado do modal de despacho/troca
  const [modalAberto, setModalAberto]       = useState(false);
  const [modalPedidosIds, setModalPedidosIds] = useState<string[]>([]);
  const [modalModoTroca, setModalModoTroca] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [modalErr, setModalErr]             = useState("");
  const [sucesso, setSucesso]               = useState("");

  // Modal do mapa da rota (visualização — o motorista é quem monta)
  const [modalRota, setModalRota] = useState<string | null>(null);

  // ── Carrega empresa do usuário (uma vez) ────────────────────────────────────

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
      setVeiculos((veicData ?? []) as VeiculoLista[]);
      setMotoristas((motData ?? []) as MotoristaLista[]);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Contagens dos KPIs (head queries, sem baixar linhas) ────────────────────

  const carregarContagens = async (eId: string) => {
    const [{ count: cFila }, { count: cDesp }, { count: cRota }] = await Promise.all([
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
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", eId)
        .eq("status", "em_andamento"),
    ]);
    setContFila(cFila ?? 0);
    setContDespachados(cDesp ?? 0);
    setContEmRota(cRota ?? 0);
  };

  useEffect(() => {
    if (!empresaId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarContagens(empresaId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // ── Carrega página de pedidos (reexecuta ao mudar pagina, empresa ou busca) ──

  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      setLoading(true);
      const from = pagina * PAGE_SIZE_DESPACHO;
      const to = from + PAGE_SIZE_DESPACHO - 1;

      // Busca no SERVIDOR: o termo casa cliente/destino/nome avulso, que moram
      // nas ENTREGAS — prefetch dos pedido_ids que casam e filtra com .in().
      // (ilike não funciona em join; regra de listagens do CLAUDE.md.)
      let idsBusca: string[] | null = null;
      const termo = buscaServidor.replace(/[%,()]/g, "").trim();
      if (termo) {
        const like = `%${termo}%`;
        const [entsTexto, clis, pedsNumero] = await Promise.all([
          supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
            .or(`destino.ilike.${like},nome_cliente_avulso.ilike.${like}`)
            .not("pedido_id", "is", null).limit(500),
          supabase.from("clientes").select("id").eq("empresa_id", empresaId)
            .or(`nome_fantasia.ilike.${like},apelido.ilike.${like}`).limit(200),
          // busca direta pelo nº do pedido (AAAA.SSSS)
          supabase.from("pedidos").select("id").eq("empresa_id", empresaId)
            .ilike("numero", like).limit(200),
        ]);
        const cliIds = (clis.data ?? []).map(c => c.id);
        const entsCli = cliIds.length > 0
          ? await supabase.from("entregas").select("pedido_id").eq("empresa_id", empresaId)
              .in("cliente_id", cliIds).not("pedido_id", "is", null).limit(500)
          : { data: [] as { pedido_id: string }[] };
        idsBusca = Array.from(new Set([
          ...(entsTexto.data ?? []).map(e => e.pedido_id),
          ...(entsCli.data ?? []).map(e => e.pedido_id),
          ...((pedsNumero.data ?? []) as { id: string }[]).map(p => p.id),
        ].filter((x): x is string => !!x)));
        if (idsBusca.length === 0) {
          setPedidos([]); setTotal(0); setLoading(false);
          return;
        }
      }

      // SEM FILTRO NENHUM: mostra todos os pedidos (qualquer status, com ou
      // sem caminhão). Só busca + paginação.
      const selectFields =
        "id,numero,status,valor_pedido,created_at,data_inicio_prevista,veiculo_id,motorista_id,motoristas(nome),veiculos(placa,apelido,modelo),entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia))";

      let q = supabase
        .from("pedidos")
        .select(selectFields, { count: "exact" })
        .eq("empresa_id", empresaId);

      if (idsBusca) q = q.in("id", idsBusca);

      const { data, count } = await (q
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to) as unknown as Promise<{ data: PedidoDespacho[] | null; count: number | null }>);

      setPedidos(data ?? []);
      setTotal(count ?? 0);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pagina, buscaServidor]);

  // ── Refinamento client-side instantâneo (a busca REAL roda no servidor via
  //    buscaServidor; isto só filtra a página atual enquanto digita) ──────────

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

  // ── Seleção ──────────────────────────────────────────────────────────────────

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

  // ── Modal despacho ───────────────────────────────────────────────────────────

  const abrirModal = (ids: string[], troca = false) => {
    setModalPedidosIds(ids);
    setModalModoTroca(troca);
    setModalErr("");
    setModalAberto(true);
  };

  const fecharModal = () => {
    if (!saving) setModalAberto(false);
  };

  // ── Confirmar despacho (novo despacho OU troca) ─────────────────────────────

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
        // ── MODO TROCA: apenas veículo/motorista, NÃO mexe no status ───────────
        const pedidoPayload = {
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
        const entregaPayload = { veiculo_id: veiculoId, motorista_id: motoristaId };
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

      } else {
        // ── MODO DESPACHO NORMAL ─────────────────────────────────────────────

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
          const pedidoPayload = {
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
        const entregaPayload = { veiculo_id: veiculoId, motorista_id: motoristaId };
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

  const totalPaginas = Math.ceil(total / PAGE_SIZE_DESPACHO);

  return {
    // Dados
    pedidos,
    filtrados,
    veiculos,
    motoristas,
    total,
    loading,
    empresaId,
    // KPIs
    contFila,
    contDespachados,
    contEmRota,
    // Busca
    busca,
    setBusca,
    // Paginação
    pagina,
    setPagina,
    totalPaginas,
    // Seleção
    selecionados,
    toggleSelecionado,
    todosSelecionados,
    toggleTodos,
    // Modal despacho
    modalAberto,
    modalPedidosIds,
    modalModoTroca,
    saving,
    modalErr,
    abrirModal,
    fecharModal,
    confirmarDespacho,
    // Modal rota
    modalRota,
    setModalRota,
    // Feedback
    sucesso,
  };
}

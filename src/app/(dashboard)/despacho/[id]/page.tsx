"use client";

/**
 * Detalhe OPERACIONAL do pedido — vive dentro do DESPACHO (decisão do dono
 * 10/06/2026: o Despacho é o cérebro da logística; a área Pedidos guarda só o
 * cadastro/edição).
 *
 * Aqui mora TUDO de operação: fluxo (stepper), despachar/trocar, execução
 * (KMs, datas reais), rota otimizada (mapa) e as entregas do pedido.
 *
 * ZERO financeiro nesta tela — valor, pagamento e parcelas são assunto da área
 * financeira (financeiro é financeiro, logística é logística).
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, Btn, Badge, Alert,
} from "@/components/ui/ds";
import { MapaRota, type MapaRotaProps } from "@/components/MapaRota";
import { FluxoStepper } from "./_components/FluxoStepper";
import { ModalDespacho, type VeiculoOpcao, type MotoristaOpcao } from "../_components/ModalDespacho";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import { rotuloPedido } from "@/lib/utils/numeroPedido";

/** Constraint do banco aceita só as formas FEMININAS (ver ../page.tsx) */
const STATUS_FEMININO: Record<string, string> = {
  agendado: "agendada", concluido: "concluida", cancelado: "cancelada",
};
const normalizarStatus = (s: string) => STATUS_FEMININO[s] ?? s;

// Parada como o MapaRota consome (subset).
type ParadaMapa = MapaRotaProps["paradas"][number];

type Pedido = {
  id: string;
  numero: string | null;
  empresa_id: string | null;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  created_at: string | null;
  local_carregamento: string | null;
  motoristas: { id: string; nome: string } | null;
  veiculos: { id: string; placa: string; apelido: string | null; marca: string; modelo: string } | null;
};

type NotaMontagem = {
  id: string;
  numero: string | null;
  endereco: unknown;
  status: string;
  capturado_em: string | null;
};

type RotaExec = {
  id: string;
  status: string;
  data: string | null;
  criada_em: string | null;
  otimizada_em: string | null;
  distancia_total_km: number | null;
  tempo_total_min: number | null;
};

const ROTA_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", otimizada: "Em aberto", em_andamento: "Em andamento",
  concluida: "Concluída", cancelada: "Cancelada",
};
const ROTA_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
  rascunho: "default", otimizada: "warning", em_andamento: "info",
  concluida: "success", cancelada: "danger",
};

/** Endereço legível do JSON da parada. */
function enderecoParada(e: unknown): string {
  const o = (e ?? {}) as { logradouro?: string; numero?: string; cidade?: string; uf?: string };
  const rua = [o.logradouro, o.numero].filter(Boolean).join(", ");
  const cidade = [o.cidade, o.uf].filter(Boolean).join("/");
  return [rua, cidade].filter(Boolean).join(" — ") || "Endereço não informado";
}

type EntregaPedido = {
  id: string;
  origem: string | null;
  destino: string | null;
  status: string;
  sequencia: number | null;
  geocode_status: string | null;
  data_coleta_prevista: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string } | null;
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
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const fmtDT   = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}

/** Cliente do pedido — vem das entregas (cadastrado ou avulso), igual à lista. */
function clienteDoPedido(entregas: EntregaPedido[]): string {
  for (const e of entregas) {
    const cli = one(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

/** "Apelido (PLACA)" quando tem apelido; senão "PLACA — marca modelo". */
const veiculoLabel = (v: { placa: string; apelido: string | null; marca: string; modelo: string }) =>
  v.apelido?.trim() ? `${v.apelido} (${v.placa})` : `${v.placa} — ${v.marca} ${v.modelo}`;

/** Linha "rótulo ····· valor" — pontilhado liga o campo ao valor (pedido do dono). */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", padding: "9px 0" }}>
      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: "2px dotted #cbd5e1", transform: "translateY(-3px)" }} />
      <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/** Bloco com borda forte e cabeçalho colorido — separa visualmente Pedido / Despacho / etc. */
function Bloco({
  titulo, cor, acoes, children,
}: {
  titulo: string;
  cor: { borda: string; fundo: string; texto: string };
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: "#fff", border: `2px solid ${cor.borda}`, borderRadius: "12px", overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
        background: cor.fundo, borderBottom: `2px solid ${cor.borda}`,
        padding: "10px 16px",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 800, color: cor.texto, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {titulo}
        </span>
        {acoes}
      </div>
      <div style={{ padding: "10px 16px 14px" }}>{children}</div>
    </section>
  );
}

const COR_PEDIDO   = { borda: "#bfdbfe", fundo: "#eff6ff", texto: "#1e40af" };
const COR_DESPACHO = { borda: "#bbf7d0", fundo: "#f0fdf4", texto: "#166534" };
const COR_ROTA     = { borda: "#fde68a", fundo: "#fffbeb", texto: "#92400e" };
const COR_ENTREGAS = { borda: "#e2e8f0", fundo: "#f8fafc", texto: "#334155" };

export default function DespachoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [entregas, setEntregas] = useState<EntregaPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Locais de carregamento: pode ter MAIS DE UM (guardados em
  // pedidos.local_carregamento separados por " | ")
  const [novoLocal, setNovoLocal] = useState("");
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  // Abas da tela: principal (pedido + despacho) e rota (mapa + execução)
  const [abaTela, setAbaTela] = useState<"principal" | "rota">("principal");
  // Rota salva pelo motorista (ou roteirizada aqui) — cabeçalho da execução
  const [rotaExec, setRotaExec] = useState<RotaExec | null>(null);
  // Notas que o motorista está capturando AGORA pra este pedido (em montagem)
  const [notasMontagem, setNotasMontagem] = useState<NotaMontagem[]>([]);
  // Despachar/trocar aqui mesmo (modal compartilhado do Despacho)
  const [modalDespacho, setModalDespacho] = useState(false);
  const [veiculosOp, setVeiculosOp] = useState<VeiculoOpcao[]>([]);
  const [motoristasOp, setMotoristasOp] = useState<MotoristaOpcao[]>([]);
  const [despachoSaving, setDespachoSaving] = useState(false);
  const [despachoErr, setDespachoErr] = useState("");
  // Roteirização
  const [paradas, setParadas] = useState<ParadaMapa[]>([]);
  const [roteirizando, setRoteirizando] = useState(false);
  const [rotaMsg, setRotaMsg] = useState<{ tipo: "success" | "error" | "info"; texto: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [pedidoRes, entregasRes, paradasRes, rotaRes] = await Promise.all([
        supabase.from("pedidos")
          .select("id,numero,empresa_id,status,data_inicio_prevista,data_fim_prevista,data_inicio_real,data_fim_real,km_inicial,km_final,observacoes,created_at,local_carregamento,motoristas(id,nome),veiculos(id,placa,apelido,marca,modelo)" as never)
          .eq("id", id)
          .single(),
        supabase.from("entregas")
          .select("id,origem,destino,status,sequencia,geocode_status,data_coleta_prevista,nome_cliente_avulso,clientes(nome_fantasia)")
          .eq("pedido_id", id)
          .order("sequencia", { ascending: true, nullsFirst: false })
          .order("data_coleta_prevista", { ascending: true }),
        // Paradas já roteirizadas (se houver) — pra desenhar o mapa ao abrir.
        supabase.from("paradas")
          .select("id,ordem,latitude,longitude,endereco,fixada,concluida_em")
          .eq("pedido_id", id)
          .order("ordem", { ascending: true }),
        // Rota salva (do celular do motorista ou roteirizada aqui) — execução.
        supabase.from("rotas_otimizadas")
          .select("id,status,data,criada_em,otimizada_em,distancia_total_km,tempo_total_min")
          .eq("pedido_id", id)
          .order("criada_em", { ascending: false })
          .limit(1),
      ]);
      setPedido(pedidoRes.data as unknown as Pedido | null);
      setEntregas((entregasRes.data ?? []) as unknown as EntregaPedido[]);
      setParadas((paradasRes.data ?? []) as unknown as ParadaMapa[]);
      setRotaExec(((rotaRes.data ?? [])[0] ?? null) as RotaExec | null);
      setLoading(false);
    };
    load();
  }, [id]);

  // ── "Tempo real" na aba Rota: a cada 10s atualiza execução + notas em
  //    montagem (o que o motorista está construindo no celular AGORA).
  useEffect(() => {
    if (abaTela !== "rota" || !pedido) return;
    let cancelado = false;
    const atualizar = async () => {
      const supabase = createClient();
      const [{ data: notas }] = await Promise.all([
        supabase.from("notas_capturadas")
          .select("id,numero,endereco,status,capturado_em")
          .eq("pedido_id", pedido.id)
          .in("status", ["capturada", "geocodificada"])
          .order("capturado_em", { ascending: true }),
        recarregarRota(),
      ]);
      if (!cancelado) setNotasMontagem((notas ?? []) as unknown as NotaMontagem[]);
    };
    void atualizar();
    const intervalo = setInterval(() => { void atualizar(); }, 10_000);
    return () => { cancelado = true; clearInterval(intervalo); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaTela, pedido?.id]);

  /** Abre o modal de despacho/troca (carrega caminhões/motoristas ativos 1x) */
  const abrirDespacho = async () => {
    setDespachoErr("");
    if (veiculosOp.length === 0 && pedido?.empresa_id) {
      const supabase = createClient();
      const [{ data: veic }, { data: mot }] = await Promise.all([
        supabase.from("veiculos").select("id,placa,apelido,marca,modelo")
          .eq("empresa_id", pedido.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome")
          .eq("empresa_id", pedido.empresa_id).eq("ativo", true).order("nome"),
      ]);
      setVeiculosOp((veic ?? []) as VeiculoOpcao[]);
      setMotoristasOp((mot ?? []) as MotoristaOpcao[]);
    }
    setModalDespacho(true);
  };

  /** Mesma gravação da lista do Despacho (status normalizado + propagação às entregas) */
  const confirmarDespachoLocal = async (veiculoId: string, motoristaId: string) => {
    if (!pedido) return;
    setDespachoSaving(true);
    setDespachoErr("");
    try {
      const supabase = createClient();
      const [empVeic, empMot] = await Promise.all([
        empresaDoVeiculo(supabase, veiculoId),
        empresaDoMotorista(supabase, motoristaId),
      ]);
      if (!empVeic) {
        setDespachoErr("Caminhão sem empresa definida. Verifique o cadastro do caminhão.");
        setDespachoSaving(false);
        return;
      }
      const statusNorm = normalizarStatus(pedido.status);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errPedido } = await supabase.from("pedidos").update({
        veiculo_id: veiculoId,
        motorista_id: motoristaId,
        empresa_motorista_id: empMot,
        status: statusNorm,
      } as any).eq("id", pedido.id);
      if (errPedido) { setDespachoErr(errPedido.message); setDespachoSaving(false); return; }

      const { error: errEnt } = await supabase.from("entregas")
        .update({ veiculo_id: veiculoId, motorista_id: motoristaId })
        .eq("pedido_id", pedido.id);
      if (errEnt) { setDespachoErr(`Pedido despachado, mas houve erro ao atualizar as entregas: ${errEnt.message}`); setDespachoSaving(false); return; }

      const vObj = veiculosOp.find(v => v.id === veiculoId);
      const mObj = motoristasOp.find(m => m.id === motoristaId);
      setPedido(p => p ? {
        ...p,
        status: statusNorm,
        veiculos: vObj ? { id: vObj.id, placa: vObj.placa, apelido: vObj.apelido, marca: vObj.marca, modelo: vObj.modelo } : p.veiculos,
        motoristas: mObj ? { id: mObj.id, nome: mObj.nome } : p.motoristas,
      } : p);
      setModalDespacho(false);
    } finally {
      setDespachoSaving(false);
    }
  };

  const changeStatus = async (novoStatus: string) => {
    setUpdatingStatus(true);
    const supabase = createClient();
    const extra: Record<string, string> = {};
    if (novoStatus === "em_andamento") extra.data_inicio_real = new Date().toISOString();
    if (novoStatus === "concluida")    extra.data_fim_real    = new Date().toISOString();
    await supabase.from("pedidos").update({ status: novoStatus, ...extra }).eq("id", id);
    setPedido(p => p ? { ...p, status: novoStatus, ...extra } : p);
    setUpdatingStatus(false);
  };

  /** Grava a lista de locais (join " | ") e propaga como origem das entregas. */
  const salvarLocais = async (lista: string[]) => {
    if (!pedido) return;
    setSalvandoLocal(true);
    const supabase = createClient();
    const texto = lista.map(s => s.trim()).filter(Boolean).join(" | ") || null;
    await supabase.from("pedidos").update({ local_carregamento: texto }).eq("id", pedido.id);
    await supabase.from("entregas").update({ origem: texto ?? "Depósito" }).eq("pedido_id", pedido.id);
    setPedido(p => p ? { ...p, local_carregamento: texto } : p);
    setEntregas(prev => prev.map(e => ({ ...e, origem: texto ?? "Depósito" })));
    setNovoLocal("");
    setSalvandoLocal(false);
  };

  const recarregarRota = async () => {
    if (!pedido) return;
    const supabase = createClient();
    const [paradasRes, entregasRes, rotaRes] = await Promise.all([
      supabase.from("paradas")
        .select("id,ordem,latitude,longitude,endereco,fixada,concluida_em")
        .eq("pedido_id", pedido.id).order("ordem", { ascending: true }),
      supabase.from("entregas")
        .select("id,origem,destino,status,sequencia,geocode_status,data_coleta_prevista,nome_cliente_avulso,clientes(nome_fantasia)")
        .eq("pedido_id", pedido.id)
        .order("sequencia", { ascending: true, nullsFirst: false })
        .order("data_coleta_prevista", { ascending: true }),
      supabase.from("rotas_otimizadas")
        .select("id,status,data,criada_em,otimizada_em,distancia_total_km,tempo_total_min")
        .eq("pedido_id", pedido.id)
        .order("criada_em", { ascending: false })
        .limit(1),
    ]);
    setParadas((paradasRes.data ?? []) as unknown as ParadaMapa[]);
    setEntregas((entregasRes.data ?? []) as unknown as EntregaPedido[]);
    setRotaExec(((rotaRes.data ?? [])[0] ?? null) as RotaExec | null);
  };

  const roteirizar = async () => {
    if (!pedido) return;
    const mot = one(pedido.motoristas);
    if (!mot?.id || !pedido.empresa_id) {
      setRotaMsg({ tipo: "error", texto: "Pedido ainda não foi despachado — despache primeiro para roteirizar." });
      return;
    }
    if (entregas.length === 0) {
      setRotaMsg({ tipo: "error", texto: "Pedido sem entregas pra roteirizar." });
      return;
    }
    setRoteirizando(true);
    setRotaMsg({ tipo: "info", texto: "Geocodificando os destinos e otimizando a rota… (pode levar alguns segundos)" });
    try {
      const res = await fetch("/api/routing/otimizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // origem omitida de propósito: o servidor usa o depósito (endereço da empresa).
        body: JSON.stringify({ motorista_id: mot.id, empresa_id: pedido.empresa_id, pedido_id: pedido.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        const motivo = json?.motivo ? ` (${json.motivo})` : "";
        const dica = json?.error === "otimizacao_falhou"
          ? " — verifique se o VROOM_URL está configurado."
          : json?.error === "todas_geocoding_falharam"
          ? " — nenhum destino pôde ser geocodificado (endereços muito vagos?)."
          : "";
        setRotaMsg({ tipo: "error", texto: `Falha ao roteirizar: ${json?.error ?? res.status}${motivo}${dica}` });
        return;
      }
      await recarregarRota();
      const naoAtend = Array.isArray(json?.nao_atendidas) ? json.nao_atendidas.length : 0;
      const nParadas = Array.isArray(json?.paradas) ? json.paradas.length : 0;
      const km = typeof json?.distancia_total_km === "number" ? json.distancia_total_km.toFixed(1) : "?";
      setRotaMsg(
        naoAtend > 0
          ? { tipo: "info", texto: `Rota gerada com ${nParadas} parada(s). ${naoAtend} entrega(s) ficaram de fora (endereço não geocodificado).` }
          : { tipo: "success", texto: `✓ Rota otimizada: ${nParadas} parada(s), ${km} km.` }
      );
    } catch (e) {
      setRotaMsg({ tipo: "error", texto: `Erro de rede ao roteirizar: ${(e as Error).message}` });
    } finally {
      setRoteirizando(false);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (!pedido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Pedido não encontrado.
    </div>
  );

  const motorista = one(pedido.motoristas);
  const veiculo   = one(pedido.veiculos);
  const despachado = !!veiculo || !!motorista;
  const finalizado = pedido.status === "cancelada" || pedido.status === "cancelado"
                  || pedido.status === "concluida" || pedido.status === "concluido";
  const cliente   = clienteDoPedido(entregas);
  const kmRodado  = pedido.km_final != null && pedido.km_inicial != null ? pedido.km_final - pedido.km_inicial : null;
  // Locais de carregamento (1 ou mais, separados por " | " no banco)
  const locais = (pedido.local_carregamento ?? "").split(" | ").map(s => s.trim()).filter(Boolean);

  // ── Stepper OPERACIONAL: sem etapa de pagamento (financeiro é financeiro) ──
  const emRota    = pedido.status === "em_andamento" || pedido.status === "concluida" || pedido.status === "concluido";
  const concluido = pedido.status === "concluida" || pedido.status === "concluido";
  const etapasFluxo = [
    { label: "Lançado",    done: true },
    { label: "Despachado", done: despachado },
    { label: "Em rota",    done: emRota },
    { label: "Concluído",  done: concluido },
  ];
  const proximaAcao =
    !despachado ? { label: "🚚 Despachar agora", onClick: abrirDespacho } :
    !emRota     ? { label: "▶ Iniciar Pedido",   onClick: () => changeStatus("em_andamento"), disabled: updatingStatus } :
    !concluido  ? { label: "✓ Concluir Pedido",  onClick: () => changeStatus("concluida"),    disabled: updatingStatus } :
    null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Pedido ${rotuloPedido(pedido.numero, pedido.id)} — ${cliente}`}
        subtitle={`Criado em ${fmtDT(pedido.created_at)}`}
        actions={
          <>
            <Btn href="/despacho" variant="ghost">← Voltar</Btn>
            {!finalizado && (
              <Btn
                variant="danger"
                disabled={updatingStatus}
                onClick={() => { if (window.confirm("Cancelar este pedido?")) changeStatus("cancelada"); }}
              >
                Cancelar
              </Btn>
            )}
          </>
        }
      >
        <Badge variant={STATUS_VAR[pedido.status] ?? "default"}>
          {STATUS_LABEL[pedido.status] ?? pedido.status}
        </Badge>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Abas: Principal (pedido + despacho) | Rota (mapa + execução) */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {([["principal", "📋 Principal"], ["rota", "🗺️ Rota"]] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAbaTela(v)}
              style={{
                padding: "6px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 600,
                cursor: "pointer",
                border: abaTela === v ? "none" : "1px solid #cbd5e1",
                background: abaTela === v ? "#2563eb" : "#fff",
                color: abaTela === v ? "#fff" : "#475569",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {abaTela === "principal" && (
        <>
        {/* Fluxo visível: onde o pedido está e qual a próxima ação */}
        <div style={{ maxWidth: "900px", marginBottom: "16px" }}>
          <FluxoStepper
            etapas={etapasFluxo}
            cancelado={pedido.status === "cancelada" || pedido.status === "cancelado"}
            acao={proximaAcao}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>

          {/* ══ TUDO QUE É DO PEDIDO ══════════════════════════════════════ */}
          <Bloco
            titulo="📦 Pedido"
            cor={COR_PEDIDO}
            acoes={<Btn href={`/pedidos/${id}/editar`} variant="outline" size="xs">✏️ Editar pedido</Btn>}
          >
            <Row label="Nº do pedido" value={<span style={{ fontFamily: "ui-monospace, monospace" }}>{rotuloPedido(pedido.numero, pedido.id)}</span>} />
            <Row label="Cliente" value={cliente} />
            <Row label="Entregas" value={<Badge variant="info">{entregas.length}</Badge>} />
            <Row label="Início Previsto" value={fmtDate(pedido.data_inicio_prevista)} />
            <Row label="Fim Previsto"    value={fmtDate(pedido.data_fim_prevista)} />

            {/* Locais de carregamento — pode ter MAIS DE UM */}
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                📍 Locais de carregamento {locais.length > 0 && `(${locais.length})`}
              </div>
              {locais.length === 0 && (
                <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 6px" }}>Nenhum local informado.</p>
              )}
              {locais.map((l, i) => (
                <div key={`${l}-${i}`} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "6px 10px", marginBottom: "4px",
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", minWidth: "20px" }}>{i + 1}º</span>
                  <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{l}</span>
                  {!finalizado && (
                    <button
                      onClick={() => salvarLocais(locais.filter((_, j) => j !== i))}
                      disabled={salvandoLocal}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#ef4444", padding: 0 }}
                      title="Remover este local"
                    >✕</button>
                  )}
                </div>
              ))}
              {!finalizado && (
                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                  <input
                    style={{ fontSize: "12px", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: "8px", flex: 1 }}
                    value={novoLocal}
                    onChange={e => setNovoLocal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && novoLocal.trim()) { e.preventDefault(); salvarLocais([...locais, novoLocal]); } }}
                    placeholder="Endereço de coleta (ex.: depósito, fornecedor...)"
                  />
                  <Btn variant="outline" size="xs" disabled={salvandoLocal || !novoLocal.trim()} onClick={() => salvarLocais([...locais, novoLocal])}>
                    {salvandoLocal ? "..." : "+ Adicionar"}
                  </Btn>
                </div>
              )}
            </div>

            {pedido.observacoes && (
              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "4px" }}>📝 Observações</div>
                <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
              </div>
            )}

            <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", marginBottom: 0 }}>
              Dados cadastrais (cliente, valor, entregas) são editados em Editar pedido. Financeiro é tratado na área financeira.
            </p>
          </Bloco>

          {/* ══ TUDO QUE É DO DESPACHO ════════════════════════════════════ */}
          <Bloco
            titulo="🚚 Despacho e Execução"
            cor={COR_DESPACHO}
            acoes={
              !finalizado ? (
                despachado
                  ? <Btn variant="outline" size="xs" onClick={abrirDespacho}>🔁 Trocar caminhão/motorista</Btn>
                  : <Btn variant="primary" size="xs" onClick={abrirDespacho}>🚚 Despachar agora</Btn>
              ) : undefined
            }
          >
            {!despachado ? (
              <p style={{ fontSize: "13px", color: "#64748b", margin: "6px 0" }}>
                Este pedido ainda <strong>não foi despachado</strong> — sem caminhão e motorista definidos.
              </p>
            ) : (
              <>
                <Row label="Caminhão"  value={veiculo ? veiculoLabel(veiculo) : "—"} />
                <Row label="Motorista" value={motorista?.nome ?? "—"} />
                <Row label="KM Inicial" value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
                <Row label="KM Final"   value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
                {kmRodado != null && (
                  <Row label="KM Rodados" value={<span style={{ color: "#2563eb" }}>{kmRodado.toLocaleString("pt-BR")} km</span>} />
                )}
                <Row label="Início Real" value={fmtDT(pedido.data_inicio_real)} />
                <Row label="Fim Real"    value={fmtDT(pedido.data_fim_real)} />
              </>
            )}
          </Bloco>

        </div>
        </>
        )}

        {abaTela === "rota" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>

          {/* ══ MAPA + ROTEIRIZAR ═════════════════════════════════════════ */}
          <Bloco titulo="🗺️ Mapa e Roteirização" cor={COR_ROTA}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                <Btn
                  variant="primary"
                  disabled={roteirizando || entregas.length === 0 || !despachado}
                  onClick={roteirizar}
                >
                  {roteirizando ? "Roteirizando…" : paradas.length > 0 ? "🔄 Re-roteirizar" : "🧭 Roteirizar"}
                </Btn>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {entregas.length === 0
                    ? "Adicione entregas ao pedido para roteirizar."
                    : !despachado
                    ? "Despache o pedido primeiro — a rota é calculada para o motorista."
                    : "Parte do depósito (endereço da empresa) e ordena os destinos das entregas."}
                </span>
              </div>

              {rotaMsg && (
                <div style={{ marginBottom: "12px" }}>
                  <Alert variant={rotaMsg.tipo === "success" ? "success" : rotaMsg.tipo === "error" ? "error" : "info"}>
                    {rotaMsg.texto}
                  </Alert>
                </div>
              )}

              {paradas.length > 0 ? (
                <MapaRota paradas={paradas} altura={380} />
              ) : (
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                  Nenhuma rota gerada ainda. Clique em <strong>Roteirizar</strong> para calcular a ordem ótima das entregas.
                </p>
              )}
          </Bloco>

          {/* ══ EM MONTAGEM (o que o motorista está capturando AGORA) ═════ */}
          {notasMontagem.length > 0 && (
            <Bloco titulo={`🧱 Em montagem — motorista capturando (${notasMontagem.length})`} cor={COR_PEDIDO}>
              <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 8px" }}>
                Destinos que o motorista está colocando no celular pra este pedido — atualiza sozinho a cada 10s.
              </p>
              {notasMontagem.map((n, i) => (
                <div key={n.id} style={{
                  display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                  padding: "7px 10px", marginBottom: "4px",
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", minWidth: "20px" }}>{i + 1}º</span>
                  <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{enderecoParada(n.endereco)}</span>
                  <span style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {n.status === "geocodificada" ? "📍 localizada" : "⏳ capturada"}
                    {n.capturado_em ? ` · ${fmtDT(n.capturado_em)}` : ""}
                  </span>
                </div>
              ))}
            </Bloco>
          )}

          {/* ══ EXECUÇÃO DA ROTA (o que o motorista fez) ══════════════════ */}
          <Bloco titulo="⏱️ Execução da Rota" cor={COR_ENTREGAS}>
            {!rotaExec && paradas.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: "6px 0" }}>
                Nenhuma rota carregada ainda. Quando o motorista montar a rota no celular
                (ou você roteirizar aqui), a execução aparece neste bloco: quando a rota
                foi salva, quando começou e a hora da baixa em cada local.
              </p>
            ) : (
              <>
                {rotaExec && (
                  <>
                    <Row label="Situação" value={
                      <Badge variant={ROTA_STATUS_VAR[rotaExec.status] ?? "default"}>
                        {ROTA_STATUS_LABEL[rotaExec.status] ?? rotaExec.status}
                      </Badge>
                    } />
                    <Row label="Rota salva em" value={fmtDT(rotaExec.criada_em)} />
                    {rotaExec.otimizada_em && <Row label="Otimizada em" value={fmtDT(rotaExec.otimizada_em)} />}
                    {(rotaExec.distancia_total_km != null || rotaExec.tempo_total_min != null) && (
                      <Row label="Distância / tempo previsto" value={
                        [
                          rotaExec.distancia_total_km != null ? `${rotaExec.distancia_total_km.toFixed(1)} km` : null,
                          rotaExec.tempo_total_min != null ? `≈${Math.round(rotaExec.tempo_total_min)} min` : null,
                        ].filter(Boolean).join(" · ")
                      } />
                    )}
                    {(() => {
                      const baixas = paradas
                        .map(p => (p as { concluida_em?: string | null }).concluida_em)
                        .filter((d): d is string => !!d)
                        .sort();
                      return baixas.length > 0
                        ? <Row label="Começou (1ª baixa)" value={fmtDT(baixas[0])} />
                        : <Row label="Começou" value="ainda sem baixas" />;
                    })()}
                  </>
                )}

                {/* baixa de cada local, na ordem da rota */}
                {paradas.length > 0 && (
                  <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                      📍 Baixas por local ({paradas.filter(p => (p as { concluida_em?: string | null }).concluida_em).length}/{paradas.length})
                    </div>
                    {paradas.map(p => {
                      const par = p as { id: string; ordem: number; endereco: unknown; concluida_em?: string | null };
                      return (
                        <div key={par.id} style={{
                          display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                          padding: "7px 10px", marginBottom: "4px",
                          background: par.concluida_em ? "#f0fdf4" : "#f8fafc",
                          border: "1px solid " + (par.concluida_em ? "#bbf7d0" : "#e2e8f0"),
                          borderRadius: "8px",
                        }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: "20px", height: "20px", padding: "0 5px",
                            borderRadius: "10px", background: par.concluida_em ? "#16a34a" : "#94a3b8",
                            color: "#fff", fontSize: "11px", fontWeight: 700,
                          }}>{par.ordem}</span>
                          <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{enderecoParada(par.endereco)}</span>
                          {par.concluida_em ? (
                            <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, whiteSpace: "nowrap" }}>
                              ✓ baixa {fmtDT(par.concluida_em)}
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>pendente</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", marginBottom: 0 }}>
              📥 Em breve: puxar endereços e produtos das notas fiscais do pedido para AJUDAR a montar a rota (o sistema sugere, o motorista decide).
            </p>
          </Bloco>

        </div>
        )}
      </div>

      {/* Despachar/trocar sem sair da tela (mesmo modal da lista do Despacho) */}
      {modalDespacho && (
        <ModalDespacho
          pedidosIds={[pedido.id]}
          veiculos={veiculosOp}
          motoristas={motoristasOp}
          onConfirm={confirmarDespachoLocal}
          onClose={() => setModalDespacho(false)}
          saving={despachoSaving}
          err={despachoErr}
          modoTroca={despachado}
        />
      )}
    </div>
  );
}

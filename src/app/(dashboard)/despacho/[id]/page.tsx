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
import { PageHeader, Btn, Badge } from "@/components/ui/ds";
import { ModalDespacho, type VeiculoOpcao, type MotoristaOpcao } from "../_components/ModalDespacho";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
import { AbaPrincipal } from "./_components/AbaPrincipal";
import { AbaRota } from "./_components/AbaRota";
import { AbaMapa } from "./_components/AbaMapa";
import {
  STATUS_LABEL, STATUS_VAR, fmtDT,
  clienteDoPedido, one,
  type Pedido, type EntregaPedido, type NotaMontagem, type RotaExec, type ParadaMapa,
} from "./_components/types";

/** Constraint do banco aceita só as formas FEMININAS (ver ../page.tsx) */
const STATUS_FEMININO: Record<string, string> = {
  agendado: "agendada", concluido: "concluida", cancelado: "cancelada",
};
const normalizarStatus = (s: string) => STATUS_FEMININO[s] ?? s;

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
  // Abas da tela: principal (pedido + despacho), rota (notas + montagem +
  // execução em tempo real) e mapa (SÓ habilita quando a rota existe)
  const [abaTela, setAbaTela] = useState<"principal" | "rota" | "mapa">("principal");
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
  // Paradas da rota (montada pelo MOTORISTA no celular — o painel só exibe)
  const [paradas, setParadas] = useState<ParadaMapa[]>([]);

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

  // ── "Tempo real" nas abas Rota/Mapa: a cada 10s atualiza execução + notas
  //    em montagem (o que o motorista está construindo no celular AGORA).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((abaTela !== "rota" && abaTela !== "mapa") || !pedido) return;
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
  const locais    = (pedido.local_carregamento ?? "").split(" | ").map(s => s.trim()).filter(Boolean);

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
        {/* Abas: Principal | Rota (notas + tempo real) | Mapa (só com rota montada) */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {([["principal", "📋 Principal", true], ["rota", "🚛 Rota", true], ["mapa", "🗺️ Mapa", paradas.length > 0]] as const).map(([v, l, habilitada]) => (
            <button
              key={v}
              type="button"
              disabled={!habilitada}
              title={!habilitada ? "Habilita quando o motorista montar a rota no celular" : undefined}
              onClick={() => habilitada && setAbaTela(v)}
              style={{
                padding: "6px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 600,
                cursor: habilitada ? "pointer" : "not-allowed",
                opacity: habilitada ? 1 : 0.45,
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
          <AbaPrincipal
            pedidoId={id}
            pedido={pedido}
            entregas={entregas}
            locais={locais}
            cliente={cliente}
            veiculo={veiculo}
            motorista={motorista}
            despachado={despachado}
            finalizado={finalizado}
            kmRodado={kmRodado}
            updatingStatus={updatingStatus}
            salvandoLocal={salvandoLocal}
            novoLocal={novoLocal}
            onNovoLocalChange={setNovoLocal}
            onSalvarLocais={salvarLocais}
            onAbrirDespacho={abrirDespacho}
            onChangeStatus={changeStatus}
          />
        )}

        {abaTela === "rota" && (
          <AbaRota
            pedidoId={id}
            notasMontagem={notasMontagem}
            rotaExec={rotaExec}
            paradas={paradas}
          />
        )}

        {abaTela === "mapa" && (
          <AbaMapa paradas={paradas} />
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

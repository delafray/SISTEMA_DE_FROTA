"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn,
  KpiCard, EmptyState, selectStyle, Alert, FormField,
} from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";

// ─── Tipos ──────────────────────────────────────────────────────────────────────

type Pedido = {
  id: string;
  status: string;
  valor_pedido: number | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  entregas: { id: string; destino: string | null }[];
};

type Veiculo = {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
};

type Motorista = {
  id: string;
  nome: string;
};

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

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const fmtMoeda = (v: number | null) =>
  v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

/** Resumo de destinos de um pedido. */
function resumoDestinos(entregas: { destino: string | null }[]): string {
  const dests = entregas
    .map(e => e.destino?.split("-")[0]?.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (dests.length === 0) return "—";
  const total = entregas.filter(e => e.destino).length;
  const extra = total > 2 ? ` +${total - 2}` : "";
  return dests.join(" / ") + extra;
}

// ─── Modal Despacho ────────────────────────────────────────────────────────────

type ModalProps = {
  pedidosIds: string[];
  veiculos: Veiculo[];
  motoristas: Motorista[];
  onConfirm: (veiculoId: string, motoristaId: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  err: string;
};

function ModalDespacho({ pedidosIds, veiculos, motoristas, onConfirm, onClose, saving, err }: ModalProps) {
  const supabase = createClient();
  const [veiculoId, setVeiculoId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [loadingMotorista, setLoadingMotorista] = useState(false);

  const handleVeiculoChange = async (vId: string) => {
    setVeiculoId(vId);
    setMotoristaId("");
    if (!vId) return;

    setLoadingMotorista(true);
    const { data } = await supabase
      .from("alocacoes")
      .select("motorista_id")
      .eq("veiculo_id", vId)
      .eq("status", "operacional")
      .is("fim", null)
      .maybeSingle();
    if (data?.motorista_id) {
      setMotoristaId(data.motorista_id as string);
    }
    setLoadingMotorista(false);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "28px",
        width: "100%",
        maxWidth: "480px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px" }}>
          Despachar Pedido{pedidosIds.length > 1 ? `s (${pedidosIds.length})` : ""}
        </h2>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px" }}>
          Selecione o veículo e o motorista para este despacho.
          {pedidosIds.length > 1 && " Todos os pedidos selecionados receberão o mesmo caminhão/motorista."}
        </p>

        {err && (
          <div style={{ marginBottom: "16px" }}>
            <Alert variant="error">{err}</Alert>
          </div>
        )}

        <FormField label="Veículo">
          <select
            value={veiculoId}
            onChange={e => handleVeiculoChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">Selecione um veículo...</option>
            {veiculos.map(v => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.marca} {v.modelo}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={`Motorista${loadingMotorista ? " (buscando padrão...)" : ""}`}>
          <select
            value={motoristaId}
            onChange={e => setMotoristaId(e.target.value)}
            style={selectStyle}
            disabled={loadingMotorista}
          >
            <option value="">
              {loadingMotorista
                ? "Carregando motorista padrão..."
                : "Selecione um motorista..."}
            </option>
            {motoristas.map(m => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </FormField>

        {veiculoId && !loadingMotorista && !motoristaId && (
          <p style={{ fontSize: "12px", color: "#f59e0b", margin: "0 0 12px" }}>
            Nenhum motorista padrão encontrado para este veículo. Selecione manualmente.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
          <Btn type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Btn>
          <Btn
            type="button"
            variant="primary"
            disabled={saving || !veiculoId || !motoristaId}
            onClick={() => onConfirm(veiculoId, motoristaId)}
          >
            {saving ? "Despachando..." : "Confirmar Despacho"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function DespachoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [veiculos, setVeiculos]     = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading]       = useState(true);

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Modal
  const [modalAberto, setModalAberto]       = useState(false);
  const [modalPedidosIds, setModalPedidosIds] = useState<string[]>([]);
  const [saving, setSaving]                 = useState(false);
  const [modalErr, setModalErr]             = useState("");
  const [sucesso, setSucesso]               = useState("");

  // ── Carregamento inicial ───────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const { data: ue } = await supabase
        .from("usuario_empresas")
        .select("empresa_id")
        .eq("usuario_id", auth.user.id)
        .eq("is_padrao", true)
        .single();
      if (!ue?.empresa_id) return;

      const empresaId = ue.empresa_id as string;

      // Busca pedidos aguardando despacho (veiculo_id IS NULL, status não finalizado)
      const pedidosData = await loadAll<Pedido>((from, to) =>
        supabase
          .from("pedidos")
          .select("id,status,valor_pedido,data_inicio_prevista,data_fim_prevista,entregas(id,destino)")
          .eq("empresa_id", empresaId)
          .is("veiculo_id", null)
          .not("status", "in", `(${STATUS_FINALIZADOS.join(",")})`)
          .order("data_inicio_prevista", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: Pedido[] | null }>
      );

      // Veículos ativos da empresa
      const { data: veicData } = await supabase
        .from("veiculos")
        .select("id,placa,marca,modelo")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("placa");

      // Motoristas ativos da empresa
      const { data: motData } = await supabase
        .from("motoristas")
        .select("id,nome")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome");

      setPedidos(pedidosData);
      setVeiculos((veicData ?? []) as Veiculo[]);
      setMotoristas((motData ?? []) as Motorista[]);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seleção ────────────────────────────────────────────────────────────────

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === pedidos.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(pedidos.map(p => p.id)));
    }
  };

  // ── Abrir modal ────────────────────────────────────────────────────────────

  const abrirModal = (ids: string[]) => {
    setModalPedidosIds(ids);
    setModalErr("");
    setModalAberto(true);
  };

  // ── Confirmar despacho ─────────────────────────────────────────────────────

  const confirmarDespacho = async (veiculoId: string, motoristaId: string) => {
    setSaving(true);
    setModalErr("");

    try {
      // Busca snapshots (empresa do veículo e empresa do motorista)
      const [empresa_id, empresa_motorista_id] = await Promise.all([
        empresaDoVeiculo(supabase, veiculoId),
        empresaDoMotorista(supabase, motoristaId),
      ]);

      if (!empresa_id) {
        setModalErr("Veículo sem empresa definida. Verifique o cadastro do veículo.");
        setSaving(false);
        return;
      }

      // Atualiza pedidos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidoPayload: any = {
        veiculo_id:           veiculoId,
        motorista_id:         motoristaId,
        empresa_motorista_id: empresa_motorista_id,
      };
      const { error: errPedidos } = await supabase
        .from("pedidos")
        .update(pedidoPayload)
        .in("id", modalPedidosIds);

      if (errPedidos) {
        setModalErr("Erro ao atualizar pedidos: " + errPedidos.message);
        setSaving(false);
        return;
      }

      // Atualiza entregas dos pedidos despachados
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entregaPayload: any = {
        veiculo_id:   veiculoId,
        motorista_id: motoristaId,
      };
      const { error: errEntregas } = await supabase
        .from("entregas")
        .update(entregaPayload)
        .in("pedido_id", modalPedidosIds);

      if (errEntregas) {
        setModalErr("Erro ao atualizar entregas: " + errEntregas.message);
        setSaving(false);
        return;
      }

      // Remove da fila local (sem reload de página)
      setPedidos(prev => prev.filter(p => !modalPedidosIds.includes(p.id)));
      setSelecionados(new Set());
      setModalAberto(false);

      const qtd = modalPedidosIds.length;
      setSucesso(
        qtd === 1
          ? "Pedido despachado com sucesso!"
          : `${qtd} pedidos despachados com sucesso!`
      );
      setTimeout(() => setSucesso(""), 4000);
    } catch (e) {
      setModalErr("Erro inesperado: " + String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const totalAguardando = pedidos.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  const todosSelecionados = pedidos.length > 0 && selecionados.size === pedidos.length;
  const algumselecionado  = selecionados.size > 0;

  const pedidosOrdenados = useMemo(
    () => [...pedidos].sort((a, b) => {
      if (!a.data_inicio_prevista && !b.data_inicio_prevista) return 0;
      if (!a.data_inicio_prevista) return 1;
      if (!b.data_inicio_prevista) return -1;
      return a.data_inicio_prevista.localeCompare(b.data_inicio_prevista);
    }),
    [pedidos]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Despacho"
        subtitle="Fila de pedidos aguardando atribuição de veículo"
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

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", maxWidth: "320px" }}>
          <KpiCard label="Aguardando Despacho" value={loading ? "..." : totalAguardando} color="warning" />
        </div>

        {/* Alerta de sucesso */}
        {sucesso && (
          <Alert variant="success">{sucesso}</Alert>
        )}

        {/* Tabela Desktop */}
        <div className="m-hide">
          <DataTable
            count={pedidos.length}
            label="pedidos aguardando despacho"
            toolbar={
              algumselecionado ? (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => abrirModal(Array.from(selecionados))}
                >
                  Despachar {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
                </Btn>
              ) : undefined
            }
          >
            <thead>
              <tr>
                <Th style={{ width: "36px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleTodos}
                    style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                    title="Selecionar todos"
                  />
                </Th>
                <Th>Status</Th>
                <Th>Data Prevista</Th>
                <Th>Destinos</Th>
                <Th>Entregas</Th>
                <Th>Valor</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                    Carregando...
                  </Td>
                </tr>
              ) : pedidosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon="🚚"
                      message="Nenhum pedido aguardando despacho. Lance um pedido primeiro."
                      action={<Btn href="/pedidos/novo">Criar Novo Pedido</Btn>}
                    />
                  </td>
                </tr>
              ) : pedidosOrdenados.map(p => {
                const entregas = Array.isArray(p.entregas) ? p.entregas : [];
                const sel = selecionados.has(p.id);
                return (
                  <Tr
                    key={p.id}
                    style={{ background: sel ? "#eff6ff" : undefined }}
                  >
                    <Td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleSelecionado(p.id)}
                        style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                      />
                    </Td>
                    <Td>
                      <Badge variant={STATUS_VAR[p.status] ?? "default"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </Td>
                    <Td>{fmtDate(p.data_inicio_prevista)}</Td>
                    <Td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resumoDestinos(entregas)}
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      <Badge variant={entregas.length > 0 ? "info" : "default"}>
                        {entregas.length}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right" }}>{fmtMoeda(p.valor_pedido)}</Td>
                    <Td>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        <Btn href={`/pedidos/${p.id}`} variant="ghost" size="xs">Ver</Btn>
                        <Btn
                          variant="primary"
                          size="xs"
                          onClick={() => abrirModal([p.id])}
                        >
                          Despachar
                        </Btn>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>

        {/* Lista Mobile */}
        <MobileList
          count={pedidosOrdenados.length}
          label="pedidos aguardando despacho"
          emptyMessage="Nenhum pedido aguardando despacho."
          emptyIcon="🚚"
        >
          {loading ? null : pedidosOrdenados.map(p => {
            const entregas = Array.isArray(p.entregas) ? p.entregas : [];
            const sel = selecionados.has(p.id);
            return (
              <MobileCard
                key={p.id}
                title={resumoDestinos(entregas) !== "—" ? resumoDestinos(entregas) : "Sem destino"}
                subtitle={`Previsto: ${fmtDate(p.data_inicio_prevista)}`}
                badge={
                  <Badge variant={STATUS_VAR[p.status] ?? "default"}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                }
                highlight={sel ? "#2563eb" : "#e2e8f0"}
                details={[
                  { label: "Entregas", value: String(entregas.length) },
                  { label: "Valor",    value: fmtMoeda(p.valor_pedido) },
                ]}
                actions={
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
                      variant={sel ? "outline" : "ghost"}
                      size="sm"
                      onClick={() => toggleSelecionado(p.id)}
                    >
                      {sel ? "Desselecionado" : "Selecionar"}
                    </Btn>
                  </div>
                }
              />
            );
          })}
        </MobileList>

        {/* FAB Mobile para despachar selecionados */}
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
        />
      )}
    </div>
  );
}

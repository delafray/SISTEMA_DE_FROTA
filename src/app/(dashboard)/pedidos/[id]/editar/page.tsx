"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, FormField, inputStyle, selectStyle,
  Btn, Alert, DataTable, Th, Td, Tr, Badge, Tabs, EmptyState,
} from "@/components/ui/ds";

type Motorista = { id: string; nome: string };
type Veiculo   = { id: string; placa: string; marca: string; modelo: string };
type EntregaAtual = {
  id: string;
  origem: string | null;
  destino: string | null;
  data_coleta_prevista: string | null;
  status: string;
  clientes: { nome_fantasia: string } | null;
};
type EntregaDisp = EntregaAtual;

type TabId = "dados" | "vinculados" | "adicionar";

const ENTREGA_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const ENTREGA_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};

const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [empresaId, setEmpresaId]       = useState("");
  const [motoristas, setMotoristas]     = useState<Motorista[]>([]);
  const [veiculos, setVeiculos]         = useState<Veiculo[]>([]);
  const [entregasAtuais, setEntregasAtuais] = useState<EntregaAtual[]>([]);
  const [entregasDisp, setEntregasDisp]     = useState<EntregaDisp[]>([]);
  const [selectedEntregas, setSelectedEntregas] = useState<Set<string>>(new Set());
  const [vinculoVeiculoId, setVinculoVeiculoId] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [loading, setLoading]           = useState(true);
  const [err, setErr]                   = useState("");
  const [tab, setTab]                   = useState<TabId>("dados");

  // Modal trocar motorista
  const [modalTroca, setModalTroca]   = useState(false);
  const [novoMotId, setNovoMotId]     = useState("");
  const [kmTroca, setKmTroca]         = useState("");
  const [motivoTroca, setMotivoTroca] = useState("");
  const [salvandoTroca, setSalvandoTroca] = useState(false);

  const [f, setF] = useState({
    motorista_id: "", veiculo_id: "", status: "agendada",
    data_inicio_prevista: "", data_fim_prevista: "",
    data_inicio_real: "", data_fim_real: "",
    km_inicial: "", km_final: "", observacoes: "",
    valor_pedido: "",
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);

      const [pedidoRes, motRes, veicRes, entAtRes, entDispRes] = await Promise.all([
        supabase.from("pedidos").select("*").eq("id", id).single(),
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("veiculos").select("id,placa,marca,modelo").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("entregas")
          .select("id,origem,destino,data_coleta_prevista,status,clientes(nome_fantasia)")
          .eq("pedido_id", id)
          .order("data_coleta_prevista", { ascending: true }),
        supabase.from("entregas")
          .select("id,origem,destino,data_coleta_prevista,status,clientes(nome_fantasia)")
          .eq("empresa_id", ue.empresa_id)
          .is("pedido_id", null)
          .in("status", ["agendado"])
          .order("data_coleta_prevista", { ascending: true }),
      ]);

      const v = pedidoRes.data;
      if (v) {
        setF({
          motorista_id: v.motorista_id ?? "",
          veiculo_id:   v.veiculo_id   ?? "",
          status:       v.status       ?? "agendada",
          data_inicio_prevista: v.data_inicio_prevista ?? "",
          data_fim_prevista:    v.data_fim_prevista    ?? "",
          data_inicio_real: v.data_inicio_real ? v.data_inicio_real.slice(0, 16) : "",
          data_fim_real:    v.data_fim_real    ? v.data_fim_real.slice(0, 16)    : "",
          km_inicial: v.km_inicial != null ? String(v.km_inicial) : "",
          km_final:   v.km_final   != null ? String(v.km_final)   : "",
          observacoes: v.observacoes ?? "",
          valor_pedido: v.valor_pedido != null ? String(v.valor_pedido) : "",
        });
      }

      setMotoristas(motRes.data ?? []);
      setVeiculos(veicRes.data ?? []);
      setEntregasAtuais((entAtRes.data ?? []) as unknown as EntregaAtual[]);
      setEntregasDisp((entDispRes.data ?? []) as unknown as EntregaDisp[]);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-preencher veículo ao trocar motorista
  useEffect(() => {
    if (!f.motorista_id || !empresaId) return;
    const supabase = createClient();
    supabase.from("motorista_veiculo")
      .select("veiculo_id")
      .eq("empresa_id", empresaId)
      .eq("motorista_id", f.motorista_id)
      .eq("ativo", true)
      .single()
      .then(({ data }) => {
        if (data?.veiculo_id) setVinculoVeiculoId(data.veiculo_id);
        else setVinculoVeiculoId(null);
      });
  }, [f.motorista_id, empresaId]);

  const toggleEntrega = (entregaId: string) => {
    setSelectedEntregas(prev => {
      const next = new Set(prev);
      if (next.has(entregaId)) next.delete(entregaId); else next.add(entregaId);
      return next;
    });
  };

  const desvincularEntrega = async (entregaId: string) => {
    const supabase = createClient();
    await supabase.from("entregas").update({ pedido_id: null }).eq("id", entregaId);
    const entrega = entregasAtuais.find(fr => fr.id === entregaId);
    setEntregasAtuais(p => p.filter(fr => fr.id !== entregaId));
    if (entrega) setEntregasDisp(p => [...p, entrega]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    if (!f.veiculo_id)   { setErr("Selecione um veículo");   return; }
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from("pedidos").update({
      motorista_id:         f.motorista_id,
      veiculo_id:           f.veiculo_id,
      status:               f.status,
      data_inicio_prevista: f.data_inicio_prevista || null,
      data_fim_prevista:    f.data_fim_prevista    || null,
      data_inicio_real: f.data_inicio_real ? new Date(f.data_inicio_real).toISOString() : null,
      data_fim_real:    f.data_fim_real    ? new Date(f.data_fim_real).toISOString()    : null,
      km_inicial:  f.km_inicial  ? parseFloat(f.km_inicial)  : null,
      km_final:    f.km_final    ? parseFloat(f.km_final)    : null,
      observacoes: f.observacoes || null,
      valor_pedido: f.valor_pedido ? parseFloat(f.valor_pedido) : null,
      updated_at:  new Date().toISOString(),
    }).eq("id", id);

    if (error) { setErr(error.message); setSaving(false); return; }

    // Vincular novas entregas selecionadas
    if (selectedEntregas.size > 0) {
      await supabase.from("entregas")
        .update({ pedido_id: id, motorista_id: f.motorista_id, veiculo_id: f.veiculo_id })
        .in("id", Array.from(selectedEntregas));
    }

    router.push(`/pedidos/${id}`);
    router.refresh();
  };

  const handleTrocarMotorista = async () => {
    if (!novoMotId) { alert("Selecione o novo motorista."); return; }
    if (!kmTroca)   { alert("Informe o KM atual no momento da troca."); return; }
    setSalvandoTroca(true);
    const supabase = createClient();
    const kmNum = parseFloat(kmTroca);

    // 1. Encerra o registro atual em pedido_motoristas
    await supabase.from("pedido_motoristas")
      .update({ ativo: false, km_saida: kmNum, data_saida: new Date().toISOString(), motivo_troca: motivoTroca || null })
      .eq("pedido_id", id)
      .eq("ativo", true);

    // 2. Cria novo registro para o novo motorista
    await supabase.from("pedido_motoristas").insert({
      pedido_id:    id,
      motorista_id: novoMotId,
      empresa_id:   empresaId,
      km_entrada:   kmNum,
      motivo_troca: motivoTroca || null,
      ativo:        true,
    });

    // 3. Atualiza pedidos.motorista_id
    await supabase.from("pedidos").update({
      motorista_id: novoMotId,
      updated_at:   new Date().toISOString(),
    }).eq("id", id);

    setSalvandoTroca(false);
    setModalTroca(false);
    setNovoMotId(""); setKmTroca(""); setMotivoTroca("");
    // Atualiza a UI local
    setF(p => ({ ...p, motorista_id: novoMotId }));
    setErr("");
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Pedido"
        actions={
          <>
            <Btn href={`/pedidos/${id}`} variant="ghost">← Voltar</Btn>
            <Btn href={`/pedidos/${id}`} variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "dados", label: "Dados do Pedido" },
            { id: "vinculados", label: "Entregas Vinculadas", badge: entregasAtuais.length },
            { id: "adicionar", label: "Adicionar Entregas", badge: selectedEntregas.size > 0 ? `+${selectedEntregas.size}` : entregasDisp.length },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {tab === "dados" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Motorista e Veículo">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <FormField label="Motorista *">
                  <select value={f.motorista_id} onChange={set("motorista_id")} style={selectStyle} required>
                    <option value="">Selecione...</option>
                    {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {f.status === "em_andamento" && (
                    <button
                      type="button"
                      onClick={() => { setModalTroca(true); setNovoMotId(""); }}
                      style={{
                        marginTop: "8px",
                        fontSize: "12px", fontWeight: 600,
                        color: "#d97706", background: "#fef3c7",
                        border: "1px solid #fcd34d", borderRadius: "6px",
                        padding: "4px 10px", cursor: "pointer",
                      }}
                    >
                      🔄 Trocar Motorista em Rota
                    </button>
                  )}
                </FormField>
                <FormField
                  label="Veículo *"
                  hint={vinculoVeiculoId === f.veiculo_id && f.veiculo_id ? "✓ Veículo padrão deste motorista" : undefined}
                >
                  <select value={f.veiculo_id} onChange={set("veiculo_id")} style={selectStyle} required>
                    <option value="">Selecione...</option>
                    {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
                  </select>
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Status e Valor">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Status">
                  <select value={f.status} onChange={set("status")} style={selectStyle}>
                    <option value="agendada">Agendada</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluida">Concluída</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </FormField>
                <FormField label="Valor do Pedido (R$)">
                  <input type="number" step="0.01" value={f.valor_pedido} onChange={set("valor_pedido")} style={inputStyle} placeholder="0.00" />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas previstas">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Início Previsto">
                  <input type="date" value={f.data_inicio_prevista} onChange={set("data_inicio_prevista")} style={inputStyle} />
                </FormField>
                <FormField label="Fim Previsto">
                  <input type="date" value={f.data_fim_prevista} onChange={set("data_fim_prevista")} style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas reais">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Início Real">
                  <input type="datetime-local" value={f.data_inicio_real} onChange={set("data_inicio_real")} style={inputStyle} />
                </FormField>
                <FormField label="Fim Real">
                  <input type="datetime-local" value={f.data_fim_real} onChange={set("data_fim_real")} style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Quilometragem">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <FormField label="KM Inicial">
                  <input type="number" value={f.km_inicial} onChange={set("km_inicial")} style={inputStyle} />
                </FormField>
                <FormField label="KM Final">
                  <input type="number" value={f.km_final} onChange={set("km_final")} style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Observações">
              <textarea value={f.observacoes} onChange={set("observacoes")} rows={3}
                style={{ ...inputStyle, resize: "vertical" }} />
            </FormSection>
          </div>
        )}

        {tab === "vinculados" && (
          entregasAtuais.length === 0
            ? <EmptyState icon="📦" message="Nenhuma entrega vinculada a este pedido. Use a aba 'Adicionar Entregas' pra incluir." />
            : (
              <DataTable count={entregasAtuais.length} label="entregas">
                <thead>
                  <tr>
                    <Th>Rota</Th>
                    <Th>Cliente</Th>
                    <Th>Coleta</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {entregasAtuais.map(fr => {
                    const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                    return (
                      <Tr key={fr.id}>
                        <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                        <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                        <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                        <Td><Badge variant={ENTREGA_STATUS_VAR[fr.status] ?? "default"}>{ENTREGA_STATUS_LABEL[fr.status] ?? fr.status}</Badge></Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => desvincularEntrega(fr.id)}
                            style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                          >
                            Desvincular
                          </button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )
        )}

        {tab === "adicionar" && (
          entregasDisp.length === 0
            ? <EmptyState icon="📭" message="Nenhuma entrega agendada disponível pra vincular." />
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  Selecione as entregas que serão incluídas neste pedido e clique em <strong>Atualizar</strong> no topo pra confirmar.
                </div>
                <DataTable count={entregasDisp.length} label="entregas disponíveis">
                  <thead>
                    <tr>
                      <Th style={{ width: "32px" }}></Th>
                      <Th>Rota</Th>
                      <Th>Cliente</Th>
                      <Th>Coleta Prevista</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregasDisp.map(fr => {
                      const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                      const checked = selectedEntregas.has(fr.id);
                      return (
                        <Tr key={fr.id}
                          style={{ cursor: "pointer", background: checked ? "rgba(219,234,254,0.4)" : undefined }}
                          onClick={() => toggleEntrega(fr.id)}
                        >
                          <Td>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEntrega(fr.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
                            />
                          </Td>
                          <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                          <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                          <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
            )
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
          <Btn href={`/pedidos/${id}`} variant="outline">Cancelar</Btn>
          <Btn type="submit" disabled={saving}>{saving ? "Salvando..." : "Atualizar Pedido"}</Btn>
        </div>
      </div>

      {/* ===== MODAL: TROCAR MOTORISTA EM ROTA ===== */}
      {modalTroca && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "28px",
            width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px 0" }}>
              🔄 Trocar Motorista em Rota
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "24px" }}>
              O histórico da troca será registrado para garantir o rateio correto de diárias no acerto mensal.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Novo Motorista *
                </label>
                <select
                  value={novoMotId}
                  onChange={e => setNovoMotId(e.target.value)}
                  style={{ ...selectStyle, width: "100%" }}
                >
                  <option value="">Selecione o motorista substituto...</option>
                  {motoristas.filter(m => m.id !== f.motorista_id).map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  KM Atual no Momento da Troca *
                </label>
                <input
                  type="number"
                  value={kmTroca}
                  onChange={e => setKmTroca(e.target.value)}
                  placeholder="Ex: 142500"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Usado para calcular quanto cada motorista rodou.
                </p>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Motivo da Troca
                </label>
                <input
                  type="text"
                  value={motivoTroca}
                  onChange={e => setMotivoTroca(e.target.value)}
                  placeholder='Ex: "Motorista passou mal em Campinas"'
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  maxLength={300}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                type="button"
                onClick={() => { setModalTroca(false); setNovoMotId(""); setKmTroca(""); setMotivoTroca(""); }}
                style={{ padding: "8px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTrocarMotorista}
                disabled={salvandoTroca}
                style={{
                  padding: "8px 20px",
                  background: salvandoTroca ? "#d97706" : "#d97706",
                  color: "#fff", border: "none", borderRadius: "8px",
                  cursor: salvandoTroca ? "not-allowed" : "pointer",
                  fontSize: "13px", fontWeight: 700,
                }}
              >
                {salvandoTroca ? "Registrando..." : "✓ Confirmar Troca"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

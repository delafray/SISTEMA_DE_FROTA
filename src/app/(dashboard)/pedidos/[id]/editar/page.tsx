"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import {
  PageHeader, FormField, inputStyle, selectStyle,
  Btn, Alert, DataTable, Th, Td, Tr, Badge, Tabs, EmptyState,
} from "@/components/ui/ds";
// Mesmo visual do detalhe do despacho (dono 11/06): blocos coloridos + campos em grade
import { Bloco, LinhaCampos, Campo } from "@/app/(dashboard)/despacho/[id]/_components/shared";
import { COR_PEDIDO, COR_DESPACHO } from "@/app/(dashboard)/despacho/[id]/_components/types";

type Cliente   = { id: string; nome_fantasia: string; apelido: string | null };
type EntregaAtual = {
  id: string;
  origem: string | null;
  destino: string | null;
  data_coleta_prevista: string | null;
  status: string;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string } | null;
};
type EntregaDisp = EntregaAtual;

type TabId = "dados" | "vinculados" | "adicionar";

/** Papéis que podem fazer ajuste manual do KM (mesmo padrão de /uso-apis). */
const ROLES_GESTOR = ["admin", "master"];

const ENTREGA_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const ENTREGA_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};

const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function one<T>(x: T | T[] | null | undefined): T | null { return Array.isArray(x) ? (x[0] ?? null) : (x ?? null); }

export default function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [_empresaId, setEmpresaId]      = useState("");
  const [isGestor, setIsGestor]         = useState(false);
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [entregasAtuais, setEntregasAtuais] = useState<EntregaAtual[]>([]);
  const [entregasDisp, setEntregasDisp]     = useState<EntregaDisp[]>([]);
  const [selectedEntregas, setSelectedEntregas] = useState<Set<string>>(new Set());
  const [saving, setSaving]             = useState(false);
  const [loading, setLoading]           = useState(true);
  const [err, setErr]                   = useState("");
  const [tab, setTab]                   = useState<TabId>("dados");
  const [confirmDesvincular, setConfirmDesvincular] = useState<string | null>(null); // entregaId pendente
  const [desvinculando, setDesvinculando] = useState(false);

  // Somente-leitura (vem do Despacho / fluxo do motorista)
  const [motoristaNome, setMotoristaNome] = useState<string | null>(null);
  const [veiculoLabel, setVeiculoLabel]   = useState<string | null>(null);
  const [motoristaId, setMotoristaId]     = useState<string | null>(null);
  const [veiculoId, setVeiculoId]         = useState<string | null>(null);
  const [kmEditavel, setKmEditavel]       = useState(false); // gestor abriu ajuste manual

  // Cliente
  const [avulso, setAvulso] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [nomeAvulso, setNomeAvulso] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);

  const [f, setF] = useState({
    status: "agendada",
    data_inicio_prevista: "", data_fim_prevista: "",
    km_inicial: "", observacoes: "", valor_pedido: "",
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id,role")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);
      setIsGestor(ROLES_GESTOR.includes((ue as { role?: string }).role ?? ""));

      const [pedidoRes, cliRes, entAtRes, entDispRes] = await Promise.all([
        supabase.from("pedidos").select("*, motoristas(nome), veiculos(placa,apelido,marca,modelo)").eq("id", id).single(),
                supabase.from("clientes").select("id,nome_fantasia,apelido").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome_fantasia"),
        supabase.from("entregas")
          .select("id,origem,destino,data_coleta_prevista,status,nome_cliente_avulso,clientes(nome_fantasia)")
          .eq("pedido_id", id)
          .order("data_coleta_prevista", { ascending: true }),
        supabase.from("entregas")
          .select("id,origem,destino,data_coleta_prevista,status,nome_cliente_avulso,clientes(nome_fantasia)")
          .eq("empresa_id", ue.empresa_id)
          .is("pedido_id", null)
          .in("status", ["agendado"])
          .order("data_coleta_prevista", { ascending: true }),
      ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v: any = pedidoRes.data;
      if (v) {
        setF({
          status:       v.status       ?? "agendada",
          data_inicio_prevista: v.data_inicio_prevista ?? "",
          data_fim_prevista:    v.data_fim_prevista    ?? "",
          km_inicial: v.km_inicial != null ? String(v.km_inicial) : "",
          observacoes: v.observacoes ?? "",
          valor_pedido: v.valor_pedido != null ? String(v.valor_pedido) : "",
        });

        // Despacho (read-only)
        const mot = one<{ nome: string }>(v.motoristas);
        const vei = one<{ placa: string; apelido: string | null; marca: string; modelo: string }>(v.veiculos);
        setMotoristaId(v.motorista_id ?? null);
        setVeiculoId(v.veiculo_id ?? null);
        setMotoristaNome(mot?.nome ?? null);
        setVeiculoLabel(vei ? (vei.apelido?.trim() || `${vei.placa} — ${vei.marca} ${vei.modelo}`) : null);

        // Cliente: cadastrado (cliente_id) ou avulso (nome nas entregas)
        const ents = (entAtRes.data ?? []) as unknown as EntregaAtual[];
        const avulsoNome = ents.find(e => e.nome_cliente_avulso?.trim())?.nome_cliente_avulso ?? "";
        if (v.cliente_id) {
          setClienteId(v.cliente_id);
          const cliMatch = (cliRes.data ?? []).find((c: Cliente) => c.id === v.cliente_id);
          setBuscaCliente(cliMatch?.nome_fantasia ?? "");
        } else if (avulsoNome) {
          setAvulso(true);
          setNomeAvulso(avulsoNome);
        }
      }

      setClientes((cliRes.data ?? []) as Cliente[]);
      setEntregasAtuais((entAtRes.data ?? []) as unknown as EntregaAtual[]);
      setEntregasDisp((entDispRes.data ?? []) as unknown as EntregaDisp[]);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setMostrarSugestoes(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clientesFiltrados = buscaCliente.trim()
    ? clientes.filter(c => {
        const q = buscaCliente.toLowerCase();
        return c.nome_fantasia.toLowerCase().includes(q) || (c.apelido && c.apelido.toLowerCase().includes(q));
      })
    : clientes.slice(0, 8);
  const clienteSelecionado = clientes.find(c => c.id === clienteId);

  const toggleEntrega = (entregaId: string) => {
    setSelectedEntregas(prev => {
      const next = new Set(prev);
      if (next.has(entregaId)) next.delete(entregaId); else next.add(entregaId);
      return next;
    });
  };

  const confirmarDesvincular = async () => {
    if (!confirmDesvincular) return;
    const entregaId = confirmDesvincular;
    setDesvinculando(true);
    const supabase = createClient();
    const { error: errDesv } = await supabase.from("entregas").update({ pedido_id: null }).eq("id", entregaId);
    setDesvinculando(false);
    if (errDesv) {
      setErr(`Erro ao desvincular: ${errDesv.message}`);
      setConfirmDesvincular(null);
      return;
    }
    const entrega = entregasAtuais.find(fr => fr.id === entregaId);
    setEntregasAtuais(p => p.filter(fr => fr.id !== entregaId));
    if (entrega) setEntregasDisp(p => [...p, entrega]);
    setConfirmDesvincular(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (!avulso && !clienteId) { setErr("Selecione um cliente cadastrado ou marque 'avulso'."); return; }
    if (avulso && !nomeAvulso.trim()) { setErr("Informe o nome do cliente avulso."); return; }
    if (f.valor_pedido !== "" && parseFloat(f.valor_pedido) < 0) { setErr("Valor não pode ser negativo."); return; }

    setSaving(true);
    const supabase = createClient();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = {
      status:               f.status,
      data_inicio_prevista: f.data_inicio_prevista || null,
      data_fim_prevista:    f.data_fim_prevista    || null,
      observacoes:          f.observacoes || null,
      valor_pedido:         f.valor_pedido ? parseFloat(f.valor_pedido) : null,
      cliente_id:           avulso ? null : clienteId,
      updated_at:           new Date().toISOString(),
    };
    // KM só é gravado quando o gestor abriu o ajuste manual.
    if (kmEditavel) payload.km_inicial = f.km_inicial ? parseFloat(f.km_inicial) : null;

    const { error } = await supabase.from("pedidos").update(payload).eq("id", id);
    if (error) { setErr(error.message); setSaving(false); return; }

    // Propaga cliente às entregas do pedido (cadastrado ou avulso).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entregaCli: any = avulso
      ? { cliente_id: null, nome_cliente_avulso: nomeAvulso.trim() }
      : { cliente_id: clienteId, nome_cliente_avulso: null };
    const { error: errCli } = await supabase.from("entregas").update(entregaCli).eq("pedido_id", id);
    if (errCli) { setErr(`Pedido salvo, mas erro ao atualizar cliente das entregas: ${errCli.message}`); setSaving(false); return; }

    // Vincular novas entregas selecionadas — herda o despacho atual do pedido (se houver).
    if (selectedEntregas.size > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vinc: any = { pedido_id: id };
      if (motoristaId) vinc.motorista_id = motoristaId;
      if (veiculoId)   vinc.veiculo_id   = veiculoId;
      await supabase.from("entregas").update(vinc).in("id", Array.from(selectedEntregas));
    }

    setSaving(false);
    router.push(`/despacho/${id}`);
    router.refresh();
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit}
      // Enter num input NÃO envia o formulário (dono 11/06: Enter no campo de
      // valor salvava e pulava pro Despacho "do nada"). Só o botão Atualizar envia.
      onKeyDown={e => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <PageHeader
        title="Editar Pedido"
        actions={<Btn href={`/despacho/${id}`} variant="ghost">← Voltar</Btn>}
      />

      {/* Linha das abas + botões de ação.
          No desktop: abas e botões ficam na mesma linha (space-between).
          No mobile: empilhados em coluna — abas no topo, botões abaixo (m-tabs-scroll). */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div className="m-tabs-scroll" style={{ flex: 1, overflowX: "auto" }}>
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
          <div className="m-hide" style={{ display: "flex", gap: "8px", flexShrink: 0, padding: "6px 0" }}>
            <Btn href={`/despacho/${id}`} variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar Pedido"}
            </Btn>
          </div>
        </div>
        {/* Botões de ação visíveis apenas no mobile, abaixo das abas */}
        <div className="m-show" style={{ padding: "8px 16px", gap: "8px", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9" }}>
          <Btn href={`/despacho/${id}`} variant="outline">Cancelar</Btn>
          <Btn type="submit" variant="primary" disabled={saving}>
            {saving ? "Salvando..." : "Atualizar Pedido"}
          </Btn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {tab === "dados" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>

            {/* ══ TUDO QUE É DO PEDIDO (mesmo bloco do detalhe do despacho) ══ */}
            <Bloco titulo="📦 Pedido" cor={COR_PEDIDO}>
              {/* ── Cliente ── */}
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, margin: "2px 0 8px" }}>👤 Cliente</div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", cursor: "pointer", fontSize: "14px", color: "#475569" }}>
                <input
                  type="checkbox"
                  checked={avulso}
                  onChange={e => { setAvulso(e.target.checked); setClienteId(""); setBuscaCliente(""); }}
                  style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
                />
                Cliente sem cadastro (avulso) — apenas o nome
              </label>

              {avulso ? (
                <FormField label="Nome do cliente avulso">
                  <input type="text" value={nomeAvulso} onChange={e => setNomeAvulso(e.target.value)} placeholder="Ex: João da Silva" style={inputStyle} />
                </FormField>
              ) : (
                <FormField label="Cliente cadastrado">
                  <div ref={buscaRef} style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={buscaCliente}
                      onChange={e => { setBuscaCliente(e.target.value); setClienteId(""); setMostrarSugestoes(true); }}
                      onFocus={() => setMostrarSugestoes(true)}
                      placeholder="Digite para buscar..."
                      style={inputStyle}
                      autoComplete="off"
                    />
                    {mostrarSugestoes && clientesFiltrados.length > 0 && !clienteSelecionado && (
                      <div style={{
                        position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0,
                        background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto", marginTop: "4px",
                      }}>
                        {clientesFiltrados.map(c => (
                          <button key={c.id} type="button"
                            onMouseDown={() => { setClienteId(c.id); setBuscaCliente(c.nome_fantasia); setMostrarSugestoes(false); }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#1e293b", borderBottom: "1px solid #f1f5f9" }}
                          >
                            {c.nome_fantasia}
                          </button>
                        ))}
                      </div>
                    )}
                    {clienteSelecionado && (
                      <div style={{ marginTop: "8px", padding: "8px 12px", background: "#eff6ff", borderRadius: "6px", fontSize: "13px", color: "#1d4ed8", fontWeight: 500 }}>
                        Selecionado: {clienteSelecionado.nome_fantasia}
                      </div>
                    )}
                  </div>
                </FormField>
              )}

              {/* ── Status / Valor / Datas — em grade, como no detalhe ── */}
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                  <FormField label="Status">
                    <select value={f.status} onChange={set("status")} style={selectStyle}>
                      <option value="agendada">Agendado</option>
                      <option value="em_andamento">Em Andamento</option>
                      <option value="concluida">Concluído</option>
                      <option value="cancelada">Cancelado</option>
                    </select>
                  </FormField>
                  <FormField label="Valor do Pedido (R$)">
                    {/* Máscara de moeda — defaultValue (não-controlado): com `value` a
                        máscara briga com o estado a cada tecla e trava a digitação.
                        O form só monta depois do load, então o valor inicial aparece. */}
                    <IMaskInput mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true, padFractionalZeros: true } }}
                      defaultValue={f.valor_pedido}
                      onAccept={(_, m) => setF(p => ({ ...p, valor_pedido: String(m.unmaskedValue) }))}
                      inputMode="decimal"
                      style={inputStyle} placeholder="R$ 0,00" />
                  </FormField>
                  <FormField label="Data Prevista (início)">
                    <input type="date" value={f.data_inicio_prevista} onChange={set("data_inicio_prevista")} style={inputStyle} />
                  </FormField>
                  <FormField label="Data Prevista (fim)">
                    <input type="date" value={f.data_fim_prevista} onChange={set("data_fim_prevista")} style={inputStyle} />
                  </FormField>
                </div>
              </div>

              {/* ── Observações ── */}
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                <FormField label="📝 Observações">
                  <textarea value={f.observacoes} onChange={set("observacoes")} rows={3} style={{ ...inputStyle, resize: "vertical", width: "100%", boxSizing: "border-box" }} />
                </FormField>
              </div>
            </Bloco>

            {/* ══ TUDO QUE É DO DESPACHO (somente leitura) ══════════════════ */}
            <Bloco
              titulo="🚚 Despacho e Execução — somente leitura"
              cor={COR_DESPACHO}
              acoes={<Btn href={`/despacho/${id}`} variant="outline" size="xs">Ir para o Despacho →</Btn>}
            >
              <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 10px" }}>
                Caminhão, motorista e KM são definidos na tela de <strong>Despacho</strong> e pelo fluxo do
                motorista. Aqui ficam apenas para conferência.
              </p>

              <LinhaCampos>
                <Campo label="Caminhão"  value={veiculoLabel ?? "Não despachado"} />
                <Campo label="Motorista" value={motoristaNome ?? "Não despachado"} />
              </LinhaCampos>

              {kmEditavel ? (
                <div style={{ marginTop: "4px" }}>
                  <FormField label="KM Inicial (ajuste manual)">
                    <input type="number" value={f.km_inicial} onChange={set("km_inicial")} style={inputStyle} placeholder="KM no início" />
                  </FormField>
                  <div style={{ fontSize: "11px", color: "#d97706", marginTop: "4px" }}>
                    ⚠ Ajuste manual de gestor — será gravado ao salvar.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "stretch", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <LinhaCampos cols={1}>
                      <Campo
                        label="KM Inicial (automático do fluxo do motorista)"
                        value={f.km_inicial ? `${Number(f.km_inicial).toLocaleString("pt-BR")} km` : "Ainda não iniciado"}
                      />
                    </LinhaCampos>
                  </div>
                  {isGestor && (
                    <button type="button" onClick={() => setKmEditavel(true)}
                      style={{ fontSize: "12px", fontWeight: 600, color: "#d97706", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "8px 12px", minHeight: "44px", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "center" }}>
                      Ajuste manual (gestor)
                    </button>
                  )}
                </div>
              )}
            </Bloco>
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
                    <Th className="m-hide">Cliente</Th>
                    <Th className="m-hide">Coleta</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {entregasAtuais.map(fr => {
                    const cliente = one<{ nome_fantasia: string }>(fr.clientes);
                    return (
                      <Tr key={fr.id}>
                        <Td style={{ fontWeight: 600, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                        <Td className="m-hide">{cliente?.nome_fantasia ?? fr.nome_cliente_avulso ?? "—"}</Td>
                        <Td className="m-hide">{fmtDate(fr.data_coleta_prevista)}</Td>
                        <Td><Badge variant={ENTREGA_STATUS_VAR[fr.status] ?? "default"}>{ENTREGA_STATUS_LABEL[fr.status] ?? fr.status}</Badge></Td>
                        <Td>
                          <button type="button" onClick={() => setConfirmDesvincular(fr.id)}
                            style={{ fontSize: "12px", color: "#ef4444", background: "none", border: "1px solid #fecaca", borderRadius: "6px", cursor: "pointer", padding: "6px 10px", minHeight: "44px", whiteSpace: "nowrap" }}>
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
                  Selecione as entregas que serão incluídas neste pedido e clique em <strong>Atualizar Pedido</strong> (no celular: abaixo das abas) pra confirmar.
                </div>
                <DataTable count={entregasDisp.length} label="entregas disponíveis">
                  <thead>
                    <tr>
                      <Th style={{ width: "32px" }}></Th>
                      <Th>Rota</Th>
                      <Th className="m-hide">Cliente</Th>
                      <Th className="m-hide">Coleta Prevista</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregasDisp.map(fr => {
                      const cliente = one<{ nome_fantasia: string }>(fr.clientes);
                      const checked = selectedEntregas.has(fr.id);
                      return (
                        <Tr key={fr.id}
                          style={{ cursor: "pointer", background: checked ? "rgba(219,234,254,0.4)" : undefined }}
                          onClick={() => toggleEntrega(fr.id)}
                        >
                          <Td>
                            <input type="checkbox" checked={checked} onChange={() => toggleEntrega(fr.id)} onClick={e => e.stopPropagation()}
                              style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }} />
                          </Td>
                          <Td style={{ fontWeight: 600, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                          <Td className="m-hide">{cliente?.nome_fantasia ?? fr.nome_cliente_avulso ?? "—"}</Td>
                          <Td className="m-hide">{fmtDate(fr.data_coleta_prevista)}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </div>
            )
        )}

      </div>

      {/* Modal de confirmação: desvincular entrega */}
      {confirmDesvincular && (
        <div
          className="m-modal-overlay"
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="m-modal-content m-modal-body"
            style={{
              background: "#fff", borderRadius: "12px", padding: "28px",
              width: "100%", maxWidth: "400px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 12px" }}>
              Desvincular entrega?
            </h3>
            <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 24px" }}>
              A entrega será removida deste pedido e voltará para a lista de disponíveis. Deseja continuar?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn type="button" variant="ghost" onClick={() => setConfirmDesvincular(null)} disabled={desvinculando}>
                Voltar
              </Btn>
              <Btn type="button" variant="danger" onClick={confirmarDesvincular} loading={desvinculando} disabled={desvinculando}>
                {desvinculando ? "Desvinculando..." : "Sim, desvincular"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable, Th, Td, Tr, Btn, Badge, EmptyState, FormField, inputStyle, selectStyle, Alert } from "@/components/ui/ds";

type Tipo = { id: string; nome: string; categoria: string; intervalo_km: number | null; intervalo_meses: number | null };
type Plano = { id: string; tipo_id: string; ativo: boolean | null; intervalo_km: number | null; intervalo_meses: number | null };
type Manut = {
  id: string; tipo_id: string; data_realizada: string | null; km_realizada: number | null;
  custo_total: number | null; fornecedor: string | null; status: string;
  descricao: string | null;
  tipos_manutencao: { nome: string; categoria: string } | { nome: string; categoria: string }[] | null;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "default"> = {
  realizada: "success", agendada: "info", em_andamento: "warning", cancelada: "default",
};

const fmtBRL = (v: number | null) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export default function ManutencoesTab({ veiculoId, empresaId, kmAtualVeiculo }: { veiculoId: string; empresaId: string; kmAtualVeiculo: number | null }) {
  const supabase = createClient();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [manuts, setManuts] = useState<Manut[]>([]);
  const [kmAtualVeic, setKmAtualVeic] = useState<number | null>(kmAtualVeiculo);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Modal protegido pra alterar KM atual
  const [kmModalOpen, setKmModalOpen] = useState(false);
  const [kmNovo, setKmNovo] = useState("");
  const [kmMotivo, setKmMotivo] = useState("");
  const [kmConfirmInput, setKmConfirmInput] = useState("");
  const [salvandoKmGestor, setSalvandoKmGestor] = useState(false);

  const [f, setF] = useState({
    tipo_id: "", data_realizada: "",
    km_realizada: "",
    custo_pecas: "", custo_mao_obra: "", fornecedor: "",
    nota_fiscal_numero: "", descricao: "", observacoes: "",
  });

  const carregar = () => {
    return Promise.all([
      supabase.from("manutencoes")
        .select("id,tipo_id,data_realizada,km_realizada,custo_total,fornecedor,status,descricao,tipos_manutencao(nome,categoria)")
        .eq("veiculo_id", veiculoId).order("data_realizada", { ascending: false, nullsFirst: false })
        .then(({ data }) => setManuts((data ?? []) as Manut[])),
      supabase.from("plano_manutencao_veiculo")
        .select("id,tipo_id,ativo,intervalo_km,intervalo_meses")
        .eq("veiculo_id", veiculoId)
        .then(({ data }) => setPlanos(data ?? [])),
      supabase.from("veiculos").select("km_atual").eq("id", veiculoId).single()
        .then(({ data }) => setKmAtualVeic(data?.km_atual ?? null)),
    ]);
  };

  useEffect(() => {
    Promise.all([
      supabase.from("tipos_manutencao").select("id,nome,categoria,intervalo_km,intervalo_meses")
        .eq("ativo", true).or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
        .order("categoria").order("nome").then(({ data }) => setTipos(data ?? [])),
      carregar(),
    ]).then(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId, empresaId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  // Pendências: tipos ativos no plano sem manutenção registrada
  const pendentes = useMemo(() => {
    const comManut = new Set(manuts.map(m => m.tipo_id));
    return planos
      .filter(p => p.ativo && !comManut.has(p.tipo_id))
      .map(p => ({ plano: p, tipo: tipos.find(t => t.id === p.tipo_id) }))
      .filter((x): x is { plano: Plano; tipo: Tipo } => !!x.tipo);
  }, [planos, manuts, tipos]);

  const tipoSelecionado = tipos.find(t => t.id === f.tipo_id);
  const planoSelecionado = planos.find(p => p.tipo_id === f.tipo_id && p.ativo);
  const intKmAtivo = planoSelecionado?.intervalo_km ?? tipoSelecionado?.intervalo_km ?? null;
  const intMesesAtivo = planoSelecionado?.intervalo_meses ?? tipoSelecionado?.intervalo_meses ?? null;

  // Preview da próxima
  const preview = useMemo(() => {
    if (!f.tipo_id) return null;
    if (intKmAtivo == null && intMesesAtivo == null) return null;
    const km = f.km_realizada ? parseFloat(f.km_realizada) : null;
    const data = f.data_realizada || null;
    return {
      km_proxima: km != null && intKmAtivo != null ? km + intKmAtivo : null,
      data_proxima: data && intMesesAtivo != null ? addMonths(data, intMesesAtivo) : null,
      intKm: intKmAtivo, intMeses: intMesesAtivo,
      semPlano: !planoSelecionado,
    };
  }, [f.tipo_id, f.km_realizada, f.data_realizada, intKmAtivo, intMesesAtivo, planoSelecionado]);

  const exigeKm = intKmAtivo != null;
  const kmIndisponivel = exigeKm && kmAtualVeic == null && !f.km_realizada;

  const abrirParaTipo = (tipoId: string) => {
    setErro("");
    setF(p => ({
      ...p,
      tipo_id: tipoId,
      // NÃO pré-preencher km — esses campos são da MANUTENÇÃO (pode ser passada), não do veículo
      km_realizada: "",
      data_realizada: "",
    }));
    setShowForm(true);
  };

  const abrirNovo = () => {
    setErro("");
    setF({
      tipo_id: "", data_realizada: "",
      km_realizada: "",
      custo_pecas: "", custo_mao_obra: "", fornecedor: "",
      nota_fiscal_numero: "", descricao: "", observacoes: "",
    });
    setShowForm(true);
  };

  const abrirModalKm = () => {
    setKmNovo(kmAtualVeic != null ? String(kmAtualVeic) : "");
    setKmMotivo("");
    setKmConfirmInput("");
    setErro("");
    setKmModalOpen(true);
  };

  const novoKmNum = kmNovo === "" ? null : parseFloat(kmNovo);
  const reduzindoKm = novoKmNum != null && kmAtualVeic != null && novoKmNum < kmAtualVeic;
  const manutsAfetadas = useMemo(() => {
    if (!reduzindoKm || novoKmNum == null) return [];
    return manuts.filter(m => m.km_realizada != null && m.km_realizada > novoKmNum);
  }, [reduzindoKm, novoKmNum, manuts]);
  const exigeConfirmacao = reduzindoKm && manutsAfetadas.length > 0;
  const podeSalvarKm =
    novoKmNum != null && !isNaN(novoKmNum) && novoKmNum >= 0 &&
    kmMotivo.trim().length >= 5 &&
    (!exigeConfirmacao || kmConfirmInput.trim().toUpperCase() === "CONFIRMO");

  const salvarKmGestor = async () => {
    if (!podeSalvarKm || novoKmNum == null) return;
    setSalvandoKmGestor(true);
    setErro("");

    const kmAntes = kmAtualVeic;

    // Se vai diminuir e há manutenções afetadas: excluir
    if (exigeConfirmacao) {
      const ids = manutsAfetadas.map(m => m.id);
      const { error: delErr } = await supabase.from("manutencoes").delete().in("id", ids);
      if (delErr) { setSalvandoKmGestor(false); setErro(delErr.message); return; }
    }

    // Atualiza km do veículo
    const { error } = await supabase.from("veiculos").update({ km_atual: novoKmNum }).eq("id", veiculoId);
    if (error) { setSalvandoKmGestor(false); setErro(error.message); return; }

    // Registra audit_logs
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_logs").insert({
        entidade: "veiculos", entidade_id: veiculoId,
        acao: reduzindoKm ? "km_diminuido_gestor" : "km_atualizado_gestor",
        descricao: `${reduzindoKm ? "REDUÇÃO" : "Atualização"} de KM por gestor. Motivo: ${kmMotivo.trim()}${manutsAfetadas.length > 0 ? ` | ${manutsAfetadas.length} manutenç${manutsAfetadas.length !== 1 ? "ões" : "ão"} excluída${manutsAfetadas.length !== 1 ? "s" : ""}` : ""}`,
        dados_antes: { km_atual: kmAntes, manutencoes_excluidas: manutsAfetadas.map(m => ({ id: m.id, km: m.km_realizada, data: m.data_realizada })) },
        dados_depois: { km_atual: novoKmNum },
        usuario_id: user.id, empresa_id: empresaId,
      });
    }

    setKmAtualVeic(novoKmNum);
    setKmModalOpen(false);
    setSalvandoKmGestor(false);
    await carregar();
  };

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!f.tipo_id) { setErro("Selecione o tipo de manutenção"); return; }
    if (exigeKm && !f.km_realizada) {
      setErro(`Esse tipo de manutenção é controlado por KM. Informe o KM do veículo no momento da manutenção.`);
      return;
    }
    setSalvando(true);

    const km = f.km_realizada ? parseFloat(f.km_realizada) : null;

    // Garante que o plano exista e esteja ativo (auto-ativa ao lançar manutenção)
    const planoExistente = planos.find(p => p.tipo_id === f.tipo_id);
    if (!planoExistente) {
      const tipo = tipos.find(t => t.id === f.tipo_id);
      await supabase.from("plano_manutencao_veiculo").insert({
        veiculo_id: veiculoId, empresa_id: empresaId, tipo_id: f.tipo_id,
        intervalo_km: tipo?.intervalo_km ?? null, intervalo_meses: tipo?.intervalo_meses ?? null, ativo: true,
      });
    } else if (!planoExistente.ativo) {
      await supabase.from("plano_manutencao_veiculo").update({ ativo: true }).eq("id", planoExistente.id);
    }

    // IMPORTANTE: NÃO sobrescrever veiculos.km_atual com km_realizada.
    // O km da manutenção pode ser PASSADO (registrar manutenção antiga).
    // O km atual do veículo é mantido separadamente (via barra do topo ou aba Dados).

    const pecas = f.custo_pecas ? parseFloat(f.custo_pecas) : null;
    const obra = f.custo_mao_obra ? parseFloat(f.custo_mao_obra) : null;
    const { error } = await supabase.from("manutencoes").insert({
      veiculo_id: veiculoId, empresa_id: empresaId, tipo_id: f.tipo_id,
      data_realizada: f.data_realizada || null,
      km_realizada: km,
      custo_pecas: pecas, custo_mao_obra: obra,
      fornecedor: f.fornecedor || null,
      nota_fiscal_numero: f.nota_fiscal_numero || null,
      descricao: f.descricao || null, observacoes: f.observacoes || null,
      km_proxima: preview?.km_proxima ?? null,
      data_proxima: preview?.data_proxima ?? null,
      status: "realizada",
    });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setShowForm(false);
    setF({
      tipo_id: "", data_realizada: "",
      km_realizada: "",
      custo_pecas: "", custo_mao_obra: "", fornecedor: "",
      nota_fiscal_numero: "", descricao: "", observacoes: "",
    });
    await carregar();
  };

  const excluir = async (m: Manut) => {
    const t = Array.isArray(m.tipos_manutencao) ? m.tipos_manutencao[0] : m.tipos_manutencao;
    const restantes = manuts.filter(x => x.tipo_id === m.tipo_id && x.id !== m.id).length;
    const aviso = restantes === 0
      ? `Excluir esta manutenção?\n\n⚠ Essa é a ÚLTIMA manutenção registrada para "${t?.nome ?? "este tipo"}". Ao excluir, o tipo será DESATIVADO automaticamente no Plano de Manutenção.`
      : "Excluir esta manutenção?";
    if (!confirm(aviso)) return;

    const { error } = await supabase.from("manutencoes").delete().eq("id", m.id);
    if (error) { setErro(error.message); return; }

    if (restantes === 0) {
      const plano = planos.find(p => p.tipo_id === m.tipo_id);
      if (plano) {
        await supabase.from("plano_manutencao_veiculo").update({ ativo: false }).eq("id", plano.id);
        setPlanos(ps => ps.map(p => p.id === plano.id ? { ...p, ativo: false } : p));
      }
    }
    setManuts(ms => ms.filter(x => x.id !== m.id));
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* Barra de KM atual do veículo */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        padding: "10px 14px",
        background: kmAtualVeic == null ? "#fef9c3" : "#f0f9ff",
        border: `1px solid ${kmAtualVeic == null ? "#fde68a" : "#bae6fd"}`,
        borderRadius: "8px",
      }}>
        <span style={{ fontSize: "13px", color: kmAtualVeic == null ? "#854d0e" : "#075985", fontWeight: 600 }}>
          {kmAtualVeic == null
            ? "⚠ KM atual do veículo não informado"
            : <>🚛 KM atual: <strong>{kmAtualVeic.toLocaleString("pt-BR")} km</strong></>}
        </span>
        <Btn type="button" size="xs" variant="outline" onClick={abrirModalKm}>
          🔒 {kmAtualVeic == null ? "Informar KM" : "Atualizar KM"}
        </Btn>
        <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "auto" }}>
          Campo protegido — só o gestor altera, motorista via WhatsApp/app
        </span>
      </div>

      {/* Pendências de registro */}
      {pendentes.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #fde68a", borderLeft: "3px solid #f59e0b", borderRadius: "8px", padding: "12px 14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
            📋 Pendências de Registro ({pendentes.length})
          </div>
          <p style={{ fontSize: "12px", color: "#78716c", margin: "0 0 10px" }}>
            Esses tipos estão ativos no Plano mas ainda não têm a última manutenção registrada. Sem isso, o sistema não consegue prever a próxima.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {pendentes.map(({ plano, tipo }) => (
              <div key={plano.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", background: "#fffbeb", borderRadius: "6px", border: "1px solid #fef3c7",
              }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{tipo.nome}</div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {tipo.categoria}
                    {plano.intervalo_km && <span> • a cada {plano.intervalo_km.toLocaleString("pt-BR")} km</span>}
                    {plano.intervalo_meses && <span> • a cada {plano.intervalo_meses} meses</span>}
                  </div>
                </div>
                <Btn type="button" size="sm" onClick={() => abrirParaTipo(tipo.id)}>
                  + Registrar última
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          Histórico: <strong style={{ color: "#1e293b" }}>{manuts.length}</strong>
          {manuts.length > 0 && (
            <span style={{ marginLeft: "12px" }}>
              Custo acumulado: <strong style={{ color: "#16a34a" }}>
                {fmtBRL(manuts.reduce((s, m) => s + (m.custo_total ?? 0), 0))}
              </strong>
            </span>
          )}
        </span>
        <Btn type="button" onClick={() => showForm ? setShowForm(false) : abrirNovo()} variant={showForm ? "outline" : "primary"}>
          {showForm ? "Cancelar" : "+ Lançar manutenção"}
        </Btn>
      </div>

      {showForm && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            <div style={{ gridColumn: "span 3" }}>
              <FormField label="Tipo de manutenção *">
                <select value={f.tipo_id} onChange={set("tipo_id")} style={selectStyle}>
                  <option value="">— Selecione —</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome} ({t.categoria})</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ gridColumn: "span 3", padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                📅 Quando essa manutenção foi feita
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <FormField label="Data da última manutenção *" hint="Dia em que o serviço foi realizado (pode ser passado)">
                  <input type="date" value={f.data_realizada} onChange={set("data_realizada")} style={inputStyle} />
                </FormField>
                <FormField label={`KM da última manutenção${exigeKm ? " *" : ""}`} hint={exigeKm ? "KM do veículo no dia em que o serviço foi feito" : "Opcional — preencha se souber"}>
                  <input type="number" value={f.km_realizada} onChange={set("km_realizada")} style={inputStyle} />
                </FormField>
              </div>
            </div>

            <FormField label="Custo peças (R$)">
              <input type="number" step="0.01" value={f.custo_pecas} onChange={set("custo_pecas")} style={inputStyle} />
            </FormField>
            <FormField label="Custo mão de obra (R$)">
              <input type="number" step="0.01" value={f.custo_mao_obra} onChange={set("custo_mao_obra")} style={inputStyle} />
            </FormField>
            <FormField label="Fornecedor / oficina">
              <input value={f.fornecedor} onChange={set("fornecedor")} style={inputStyle} />
            </FormField>
            <FormField label="Nota fiscal">
              <input value={f.nota_fiscal_numero} onChange={set("nota_fiscal_numero")} style={inputStyle} />
            </FormField>
            <div style={{ gridColumn: "span 3" }}>
              <FormField label="Descrição do serviço">
                <textarea value={f.descricao} onChange={set("descricao")} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </FormField>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <FormField label="Observações">
                <textarea value={f.observacoes} onChange={set("observacoes")} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </FormField>
            </div>
          </div>

          {kmIndisponivel && (
            <div style={{
              marginTop: "12px", padding: "10px 14px",
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px",
              fontSize: "12px", color: "#991b1b",
            }}>
              ⚠ Tipo controlado por KM, mas nem o KM atual do veículo nem o KM da manutenção foram informados. Preencha o campo acima ou informe o KM atual na barra do topo.
            </div>
          )}

          {preview && (preview.km_proxima != null || preview.data_proxima) && (
            <div style={{
              marginTop: "12px", padding: "10px 14px",
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px",
              fontSize: "13px", color: "#1e40af",
            }}>
              <strong>📅 Próxima manutenção prevista:</strong>{" "}
              {preview.km_proxima != null && <span>~{preview.km_proxima.toLocaleString("pt-BR")} km</span>}
              {preview.km_proxima != null && preview.data_proxima && <span> ou </span>}
              {preview.data_proxima && <span>até {fmtDate(preview.data_proxima)}</span>}
              {preview.semPlano && (
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#3b82f6" }}>
                  ⚡ O plano ainda não está ativo — será ativado automaticamente ao salvar.
                </div>
              )}
            </div>
          )}
          {preview === null && f.tipo_id && (
            <div style={{
              marginTop: "12px", padding: "10px 14px",
              background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px",
              fontSize: "12px", color: "#854d0e",
            }}>
              ⚠ Esse tipo não tem intervalo km nem meses definido. A próxima manutenção não será calculada.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            <Btn type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Btn>
            <Btn type="button" onClick={lancar} disabled={salvando || kmIndisponivel}>
              {salvando ? "Salvando..." : "Salvar manutenção"}
            </Btn>
          </div>
        </div>
      )}

      {manuts.length === 0
        ? <EmptyState icon="🔧" message={pendentes.length > 0 ? "Use as pendências acima pra registrar a última manutenção de cada tipo ativo." : "Nenhuma manutenção lançada. Ative tipos na aba 'Plano de Manutenção' primeiro."} />
        : (
          <DataTable count={manuts.length} label="manutenções">
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Categoria</Th>
                <Th style={{ textAlign: "right" }}>KM</Th>
                <Th style={{ textAlign: "right" }}>Custo</Th>
                <Th>Fornecedor</Th>
                <Th>Status</Th>
                <Th style={{ width: "40px" }} />
              </tr>
            </thead>
            <tbody>
              {manuts.map(m => {
                const t = Array.isArray(m.tipos_manutencao) ? m.tipos_manutencao[0] : m.tipos_manutencao;
                return (
                  <Tr key={m.id}>
                    <Td>{fmtDate(m.data_realizada)}</Td>
                    <Td style={{ fontWeight: 500 }}>{t?.nome ?? "—"}</Td>
                    <Td style={{ textTransform: "capitalize", color: "#64748b" }}>{t?.categoria ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>{m.km_realizada?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{fmtBRL(m.custo_total)}</Td>
                    <Td style={{ color: "#64748b" }}>{m.fornecedor ?? "—"}</Td>
                    <Td><Badge variant={STATUS_VARIANT[m.status] ?? "default"}>{m.status}</Badge></Td>
                    <Td>
                      <button type="button" onClick={() => excluir(m)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "13px" }}
                        title="Excluir">🗑</button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

      {/* MODAL PROTEGIDO — Atualizar KM (Gestor) */}
      {kmModalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "16px",
        }} onClick={() => !salvandoKmGestor && setKmModalOpen(false)}>
          <div style={{
            background: "#fff", borderRadius: "12px", padding: "20px",
            width: "100%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto",
            boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              ⚠ Atualizar KM do veículo
            </h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 14px" }}>
              Este campo afeta TODOS os cálculos de manutenção, alertas e relatórios. Use com cuidado.
            </p>

            <div style={{
              background: "#fef2f2", border: "2px solid #fecaca", borderRadius: "8px",
              padding: "10px 12px", marginBottom: "14px", fontSize: "12px", color: "#7f1d1d", lineHeight: 1.5,
            }}>
              <strong>🚨 Atenção:</strong> em condições normais, o KM é atualizado automaticamente pelo motorista (via WhatsApp ou app, com o veículo em mãos). Use esta tela só pra correção manual.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>KM atual</label>
                <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
                  {kmAtualVeic != null ? `${kmAtualVeic.toLocaleString("pt-BR")} km` : "—"}
                </div>
              </div>
              <FormField label="Novo KM *">
                <input type="number" value={kmNovo} onChange={e => setKmNovo(e.target.value)}
                  autoFocus min={0}
                  style={inputStyle} />
              </FormField>
            </div>

            <FormField label="Motivo da alteração *" hint="Mínimo 5 caracteres — será registrado no audit log">
              <textarea value={kmMotivo} onChange={e => setKmMotivo(e.target.value)} rows={2}
                placeholder="Ex: motorista esqueceu de informar e veio direto na empresa"
                style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "1px solid #cbd5e1", borderRadius: "8px", resize: "vertical" }} />
            </FormField>

            {reduzindoKm && (
              <div style={{
                background: "#fef2f2", border: "2px solid #ef4444", borderRadius: "8px",
                padding: "12px", marginTop: "12px", fontSize: "13px", color: "#7f1d1d",
              }}>
                <strong>🛑 Você está REDUZINDO o KM</strong> de {kmAtualVeic?.toLocaleString("pt-BR")} para {novoKmNum?.toLocaleString("pt-BR")} km.
                {manutsAfetadas.length > 0 ? (
                  <>
                    <div style={{ marginTop: "8px", fontWeight: 600 }}>
                      As seguintes {manutsAfetadas.length} manutenç{manutsAfetadas.length !== 1 ? "ões" : "ão"} serão EXCLUÍDAS (km maior que o novo):
                    </div>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: "12px" }}>
                      {manutsAfetadas.map(m => {
                        const t = Array.isArray(m.tipos_manutencao) ? m.tipos_manutencao[0] : m.tipos_manutencao;
                        return (
                          <li key={m.id}>
                            {t?.nome ?? "—"} — {m.km_realizada?.toLocaleString("pt-BR")} km ({fmtDate(m.data_realizada)})
                          </li>
                        );
                      })}
                    </ul>
                    <div style={{ marginTop: "10px", padding: "8px", background: "#fff", borderRadius: "6px", border: "1px solid #fecaca" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#7f1d1d", marginBottom: "4px" }}>
                        Digite <code style={{ background: "#fee2e2", padding: "1px 6px", borderRadius: "4px" }}>CONFIRMO</code> para prosseguir:
                      </label>
                      <input type="text" value={kmConfirmInput} onChange={e => setKmConfirmInput(e.target.value)}
                        placeholder="CONFIRMO"
                        style={{ width: "100%", padding: "6px 10px", fontSize: "13px", border: "1px solid #ef4444", borderRadius: "6px", textTransform: "uppercase" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: "6px", fontSize: "12px" }}>
                    Nenhuma manutenção será afetada (não há registros com km maior que o novo).
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <Btn type="button" variant="outline" onClick={() => setKmModalOpen(false)} disabled={salvandoKmGestor}>
                Cancelar
              </Btn>
              <Btn type="button" onClick={salvarKmGestor} disabled={!podeSalvarKm || salvandoKmGestor}>
                {salvandoKmGestor ? "Salvando..." : "Confirmar alteração"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

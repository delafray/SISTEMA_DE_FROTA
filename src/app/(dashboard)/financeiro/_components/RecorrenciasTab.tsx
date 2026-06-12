"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Btn, DataTable, Th, Td, Tr, Badge, EmptyState, Alert,
  useTableSort, inputStyle, selectStyle, FormField, FormSection, ActionBtn,
} from "@/components/ui/ds";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const hoje = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const CATEGORIAS_REC = [
  "seguro", "ipva_licenciamento", "rastreamento", "aluguel", "mensalidade_sistema",
  "folha_pagamento", "contabilidade", "internet", "outros",
];

type Recorrencia = {
  id: string;
  descricao: string;
  categoria: string;
  tipo: "entrada" | "saida";
  valor: number;
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  empresa_id: string;
};

type Form = {
  descricao: string;
  categoria: string;
  tipo: "entrada" | "saida";
  valor: string;
  dia_vencimento: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

const formVazio = (): Form => ({
  descricao: "",
  categoria: "outros",
  tipo: "saida",
  valor: "",
  dia_vencimento: "1",
  data_inicio: hoje().slice(0, 7) + "-01",
  data_fim: "",
  ativo: true,
});

export default function RecorrenciasTab({ empresas }: { empresas: string[] }) {
  const supabase = createClient();
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formVazio());
  const [filtroAtivo, setFiltroAtivo] = useState<"todos" | "ativas" | "inativas">("ativas");
  const [excluindo, setExcluindo] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState<{ id: string; descricao: string } | null>(null);
  const [togglendoId, setTogglendoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    const { data, error } = await supabase
      .from("recorrencias_financeiras")
      .select("*")
      .in("empresa_id", empresas)
      .order("descricao");

    if (error) setErro(error.message);
    else setRecorrencias((data as Recorrencia[]) ?? []);
    setLoading(false);
  }, [empresas, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const filtradas = recorrencias.filter(r => {
    if (filtroAtivo === "ativas") return r.ativo;
    if (filtroAtivo === "inativas") return !r.ativo;
    return true;
  });

  const { sortedData, sortKey, sortDirection, handleSort } = useTableSort<Recorrencia>(filtradas, "descricao", "asc");

  const totalMensalSaida = recorrencias.filter(r => r.ativo && r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
  const totalMensalEntrada = recorrencias.filter(r => r.ativo && r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(formVazio());
    setModalAberto(true);
  };

  const abrirEditar = (r: Recorrencia) => {
    setEditandoId(r.id);
    setForm({
      descricao: r.descricao,
      categoria: r.categoria,
      tipo: r.tipo,
      valor: r.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      dia_vencimento: String(r.dia_vencimento),
      data_inicio: r.data_inicio,
      data_fim: r.data_fim ?? "",
      ativo: r.ativo,
    });
    setModalAberto(true);
  };

  const fecharModal = () => { setModalAberto(false); setEditandoId(null); };

  const salvar = async () => {
    const dia = parseInt(form.dia_vencimento);
    const valorNormalizado = form.valor.replace(",", ".");
    const valorNum = parseFloat(valorNormalizado);
    if (!form.descricao.trim() || !form.valor || isNaN(valorNum) || valorNum <= 0 || isNaN(dia) || dia < 1 || dia > 31) {
      setErro("Preencha todos os campos obrigatórios. Valor deve ser positivo. Dia deve ser entre 1 e 31."); return;
    }
    setSalvando(true);
    setErro("");

    const payload = {
      empresa_id: empresas[0], // recorrência: grava na 1ª empresa do gestor
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      tipo: form.tipo,
      valor: valorNum,
      dia_vencimento: dia,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim.trim() || null,
      ativo: form.ativo,
    };

    let error;
    if (editandoId) {
      ({ error } = await supabase.from("recorrencias_financeiras").update(payload).eq("id", editandoId));
    } else {
      ({ error } = await supabase.from("recorrencias_financeiras").insert(payload));
    }

    if (error) setErro(error.message);
    else { fecharModal(); await carregar(); }
    setSalvando(false);
  };

  const excluir = (id: string, descricao?: string) => {
    setConfirmExcluir({ id, descricao: descricao ?? "esta recorrência" });
  };

  const confirmarExcluir = async () => {
    if (!confirmExcluir) return;
    setExcluindo(true);
    setConfirmExcluir(null);
    const { error } = await supabase.from("recorrencias_financeiras").delete().eq("id", confirmExcluir.id);
    if (error) { setErro(error.message); setExcluindo(false); return; }
    fecharModal();
    await carregar();
    setExcluindo(false);
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    if (togglendoId) return; // evita duplo clique
    setTogglendoId(id);
    const { error } = await supabase.from("recorrencias_financeiras").update({ ativo }).eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
    setTogglendoId(null);
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* KPIs */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px", flex: "1 1 140px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>📆 Saídas/Mês</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b" }}>{fmtBRL(totalMensalSaida)}</div>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>{recorrencias.filter(r => r.ativo && r.tipo === "saida").length} recorrências ativas</div>
        </div>
        {totalMensalEntrada > 0 && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", flex: "1 1 140px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>📆 Entradas/Mês</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#15803d" }}>{fmtBRL(totalMensalEntrada)}</div>
          </div>
        )}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px", flex: "1 1 140px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>📊 Saldo Mensal</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: totalMensalEntrada - totalMensalSaida >= 0 ? "#16a34a" : "#dc2626" }}>
            {fmtBRL(totalMensalEntrada - totalMensalSaida)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
          <Btn variant="primary" onClick={abrirNovo} icon="＋">Nova Recorrência</Btn>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "6px" }}>
        {([["ativas", "Ativas"], ["inativas", "Inativas"], ["todos", "Todas"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFiltroAtivo(v)}
            style={{
              padding: "4px 12px", minHeight: "44px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
              background: filtroAtivo === v ? "#2563eb" : "#fff",
              color: filtroAtivo === v ? "#fff" : "#475569",
              border: "1px solid #cbd5e1", cursor: "pointer",
            }}>{l}</button>
        ))}
      </div>

      {/* Tabela */}
      {sortedData.length === 0
        ? (
          <EmptyState icon="🔄" message="Nenhuma recorrência cadastrada. Cadastre despesas fixas mensais como seguro, IPVA, rastreamento, etc."
            action={<Btn onClick={abrirNovo}>+ Nova Recorrência</Btn>} />
        )
        : (
          <>
          <div className="m-hide">
          <DataTable count={sortedData.length} label="recorrências">
            <thead>
              <tr>
                <Th sortKey="descricao" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Descrição</Th>
                <Th sortKey="categoria" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Categoria</Th>
                <Th sortKey="tipo" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Tipo</Th>
                <Th sortKey="dia_vencimento" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "center" }}>Dia</Th>
                <Th sortKey="valor" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor/Mês</Th>
                <Th>Vigência</Th>
                <Th style={{ textAlign: "center" }}>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(r => (
                <Tr key={r.id} onClick={() => abrirEditar(r)} clickable muted={!r.ativo}>
                  <Td style={{ fontWeight: 600, fontSize: "12px" }}>{r.descricao}</Td>
                  <Td><Badge variant="default">{r.categoria.replace(/_/g, " ")}</Badge></Td>
                  <Td>
                    <Badge variant={r.tipo === "entrada" ? "success" : "danger"}>
                      {r.tipo === "entrada" ? "↑ Entrada" : "↓ Saída"}
                    </Badge>
                  </Td>
                  <Td style={{ textAlign: "center", fontWeight: 700, color: "#475569" }}>dia {r.dia_vencimento}</Td>
                  <Td style={{ textAlign: "right", fontWeight: 700, color: r.tipo === "entrada" ? "#16a34a" : "#dc2626" }}>
                    {fmtBRL(r.valor)}
                  </Td>
                  <Td style={{ fontSize: "11px", color: "#64748b" }}>
                    {fmtDate(r.data_inicio)} {r.data_fim ? `→ ${fmtDate(r.data_fim)}` : "→ sem fim"}
                  </Td>
                  <Td style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                      <ActionBtn
                        title={r.ativo ? "Desativar" : "Ativar"}
                        variant={r.ativo ? "default" : "success"}
                        disabled={togglendoId === r.id}
                        onClick={() => toggleAtivo(r.id, !r.ativo)}
                      >
                        {togglendoId === r.id ? "…" : r.ativo ? "⏸" : "▶"}
                      </ActionBtn>
                      <ActionBtn title="Excluir" variant="danger" onClick={() => excluir(r.id, r.descricao)}>✕</ActionBtn>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: cards */}
          <MobileList count={sortedData.length} label="recorrências">
            {sortedData.map(r => (
              <MobileCard
                key={r.id}
                onClick={() => abrirEditar(r)}
                title={r.descricao}
                subtitle={`Dia ${r.dia_vencimento} • ${r.categoria.replace(/_/g, " ")}`}
                badge={
                  <Badge variant={r.tipo === "entrada" ? "success" : "danger"}>
                    {r.tipo === "entrada" ? "↑ Entrada" : "↓ Saída"}
                  </Badge>
                }
                highlight={r.ativo ? (r.tipo === "entrada" ? "#16a34a" : "#dc2626") : "#94a3b8"}
                details={[
                  { label: "Valor/Mês", value: fmtBRL(r.valor) },
                  { label: "Status", value: r.ativo ? "Ativa" : "Inativa" },
                ]}
                actions={
                  <div style={{ display: "flex", gap: "6px" }}>
                    <Btn
                      size="xs"
                      variant="outline"
                      disabled={togglendoId === r.id}
                      loading={togglendoId === r.id}
                      onClick={() => toggleAtivo(r.id, !r.ativo)}
                    >
                      {r.ativo ? "⏸ Desativar" : "▶ Ativar"}
                    </Btn>
                    <Btn size="xs" variant="danger" onClick={() => excluir(r.id, r.descricao)}>✕ Excluir</Btn>
                  </div>
                }
              />
            ))}
          </MobileList>

          <MobileFAB onClick={abrirNovo} label="Nova Recorrência" />
          </>
        )}

      {/* Modal CRUD */}
      {modalAberto && (
        <div className="m-modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "flex-start", justifyContent: "center", zIndex: 1000, overflowY: "auto",
          padding: "40px 16px",
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
            <div style={{ padding: "24px 24px 0" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>
                {editandoId ? "Editar Recorrência" : "Nova Recorrência Financeira"}
              </h2>
            </div>

            <div className="m-modal-body" style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
              <FormSection>
                <FormField label="Descrição *">
                  <input style={inputStyle} value={form.descricao}
                    onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Seguro Frota, IPVA Caminhão 1..." />
                </FormField>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <FormField label="Categoria *">
                    <select style={selectStyle} value={form.categoria}
                      onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                      {CATEGORIAS_REC.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Tipo *">
                    <select style={selectStyle} value={form.tipo}
                      onChange={e => setForm(f => ({ ...f, tipo: e.target.value as "entrada" | "saida" }))}>
                      <option value="saida">↓ Saída (Despesa)</option>
                      <option value="entrada">↑ Entrada (Receita)</option>
                    </select>
                  </FormField>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <FormField label="Valor Mensal (R$) *">
                    <input type="text" inputMode="decimal" style={inputStyle} value={form.valor}
                      onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                      placeholder="150,00" />
                  </FormField>
                  <FormField label="Dia do Vencimento *" hint="Entre 1 e 31">
                    <input type="number" min="1" max="31" style={inputStyle} value={form.dia_vencimento}
                      onChange={e => setForm(f => ({ ...f, dia_vencimento: e.target.value }))} />
                  </FormField>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <FormField label="Data de Início *">
                    <input type="date" style={inputStyle} value={form.data_inicio}
                      onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                  </FormField>
                  <FormField label="Data de Término" hint="Deixe vazio para sem fim">
                    <input type="date" style={inputStyle} value={form.data_fim}
                      onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
                  </FormField>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f0fdf4", borderRadius: "8px" }}>
                  <input type="checkbox" id="chk-ativo" checked={form.ativo}
                    onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                  <label htmlFor="chk-ativo" style={{ fontSize: "13px", fontWeight: 600, color: "#16a34a", cursor: "pointer" }}>
                    Recorrência ativa (será gerada no fluxo de caixa)
                  </label>
                </div>
              </FormSection>
            </div>

            <div style={{ padding: "16px 24px 24px", display: "flex", gap: "8px", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9" }}>
              <Btn variant="outline" onClick={fecharModal} disabled={salvando}>Cancelar</Btn>
              {editandoId && (
                <Btn variant="danger" onClick={() => excluir(editandoId, form.descricao)} disabled={salvando || excluindo} loading={excluindo}>
                  {excluindo ? "Excluindo..." : "Excluir"}
                </Btn>
              )}
              <Btn variant="primary" onClick={salvar} disabled={salvando} loading={salvando}>
                {salvando ? "Salvando..." : editandoId ? "Salvar" : "Criar Recorrência"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmExcluir && (
        <div className="m-modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "16px",
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "360px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>Excluir recorrência</h2>
            <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 4px" }}>
              <strong>{confirmExcluir.descricao}</strong>
            </p>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 20px" }}>
              Esta ação não pode ser desfeita. Lançamentos futuros desta recorrência não serão gerados.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => setConfirmExcluir(null)} disabled={excluindo}>Voltar</Btn>
              <Btn variant="danger" onClick={confirmarExcluir} loading={excluindo} disabled={excluindo}>
                {excluindo ? "Excluindo..." : "Excluir"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

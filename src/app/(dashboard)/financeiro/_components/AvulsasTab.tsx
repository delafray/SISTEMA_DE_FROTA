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

const CATEGORIAS = [
  "combustivel", "manutencao", "pneus", "seguro", "ipva_licenciamento",
  "pedagio", "lavagem", "administrativo", "imposto", "aluguel", "outros",
];

type Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  pago: boolean;
  fornecedor: string | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  empresa_id: string;
};

type Form = {
  descricao: string;
  categoria: string;
  valor: string;
  data_vencimento: string;
  fornecedor: string;
  forma_pagamento: string;
  observacoes: string;
  pago: boolean;
  data_pagamento: string;
};

const formVazio = (): Form => ({
  descricao: "",
  categoria: "outros",
  valor: "",
  data_vencimento: hoje(),
  fornecedor: "",
  forma_pagamento: "",
  observacoes: "",
  pago: false,
  data_pagamento: "",
});

export default function AvulsasTab({ empresas }: { empresas: string[] }) {
  const supabase = createClient();
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(formVazio());
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroPago, setFiltroPago] = useState<"todos" | "pago" | "pendente">("todos");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState<{ id: string; descricao: string } | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    const { data, error } = await supabase
      .from("despesas_avulsas")
      .select("*")
      .in("empresa_id", empresas)
      .order("data_vencimento", { ascending: false });

    if (error) setErro(error.message);
    else setDespesas((data as Despesa[]) ?? []);
    setLoading(false);
  }, [empresas, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const filtradas = despesas
    .filter(d => filtroCategoria === "todas" || d.categoria === filtroCategoria)
    .filter(d => {
      if (filtroPago === "pago") return d.pago;
      if (filtroPago === "pendente") return !d.pago;
      return true;
    });

  const { sortedData, sortKey, sortDirection, handleSort } = useTableSort<Despesa>(filtradas, "data_vencimento", "desc");

  const hoje_ = hoje();
  const totalPendente = despesas.filter(d => !d.pago).reduce((s, d) => s + d.valor, 0);
  const totalPago = despesas.filter(d => d.pago).reduce((s, d) => s + d.valor, 0);

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(formVazio());
    setModalAberto(true);
  };

  const abrirEditar = (d: Despesa) => {
    setEditandoId(d.id);
    setForm({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: String(d.valor),
      data_vencimento: d.data_vencimento,
      fornecedor: d.fornecedor ?? "",
      forma_pagamento: d.forma_pagamento ?? "",
      observacoes: d.observacoes ?? "",
      pago: d.pago,
      data_pagamento: d.data_pagamento ?? "",
    });
    setModalAberto(true);
  };

  const fecharModal = () => { setModalAberto(false); setEditandoId(null); };

  const salvar = async () => {
    const valorNormalizado = form.valor.replace(",", ".");
    const valorNum = parseFloat(valorNormalizado);
    if (!form.descricao.trim() || !form.valor || isNaN(valorNum) || valorNum <= 0) {
      setErro("Preencha descrição e informe um valor válido (ex: 150,00)."); return;
    }
    if (form.pago && !form.data_pagamento) {
      setErro("Informe a data de pagamento quando marcar como pago."); return;
    }
    setSalvando(true);
    setErro("");

    const payload = {
      empresa_id: empresas[0], // despesa avulsa: grava na 1ª empresa do gestor
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor: valorNum,
      data_vencimento: form.data_vencimento,
      fornecedor: form.fornecedor.trim() || null,
      forma_pagamento: form.forma_pagamento.trim() || null,
      observacoes: form.observacoes.trim() || null,
      pago: form.pago,
      data_pagamento: form.pago && form.data_pagamento ? form.data_pagamento : null,
    };

    let error;
    if (editandoId) {
      ({ error } = await supabase.from("despesas_avulsas").update(payload).eq("id", editandoId));
    } else {
      ({ error } = await supabase.from("despesas_avulsas").insert(payload));
    }

    if (error) setErro(error.message);
    else { fecharModal(); await carregar(); }
    setSalvando(false);
  };

  const excluir = (id: string, descricao?: string) => {
    setConfirmExcluir({ id, descricao: descricao ?? "esta despesa" });
  };

  const confirmarExcluir = async () => {
    if (!confirmExcluir) return;
    setExcluindo(true);
    setConfirmExcluir(null);
    const { error } = await supabase.from("despesas_avulsas").delete().eq("id", confirmExcluir.id);
    if (error) { setErro(error.message); setExcluindo(false); return; }
    fecharModal();
    await carregar();
    setExcluindo(false);
  };

  const marcarPago = async (id: string, pago: boolean) => {
    setSalvandoId(id);
    const update = pago
      ? { pago: true, data_pagamento: hoje_ }
      : { pago: false, data_pagamento: null };
    const { error } = await supabase.from("despesas_avulsas").update(update).eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
    setSalvandoId(null);
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* KPIs + botão novo */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px", flex: "1 1 140px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>📤 Pendente</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b" }}>{fmtBRL(totalPendente)}</div>
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", flex: "1 1 140px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>✅ Pago</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#15803d" }}>{fmtBRL(totalPago)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
          <Btn variant="primary" onClick={abrirNovo} icon="＋">Nova Despesa</Btn>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          style={{ ...selectStyle, width: "auto", padding: "4px 8px", fontSize: "12px" }}>
          <option value="todas">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <div style={{ display: "flex", gap: "4px" }}>
          {([["todos", "Todos"], ["pendente", "Pendentes"], ["pago", "Pagos"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltroPago(v)}
              style={{
                padding: "4px 10px", minHeight: "44px", fontSize: "11px", fontWeight: 600, borderRadius: "6px",
                background: filtroPago === v ? "#2563eb" : "#fff",
                color: filtroPago === v ? "#fff" : "#475569",
                border: "1px solid #cbd5e1", cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {sortedData.length === 0
        ? <EmptyState icon="🧾" message="Nenhuma despesa avulsa cadastrada." action={<Btn onClick={abrirNovo}>+ Nova Despesa</Btn>} />
        : (
          <>
          <div className="m-hide">
          <DataTable count={sortedData.length} label="despesas">
            <thead>
              <tr>
                <Th sortKey="data_vencimento" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Vencimento</Th>
                <Th sortKey="descricao" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Descrição</Th>
                <Th sortKey="categoria" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Categoria</Th>
                <Th sortKey="valor" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: "center" }}>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(d => {
                const atrasado = !d.pago && d.data_vencimento < hoje_;
                return (
                  <Tr key={d.id} onClick={() => abrirEditar(d)} clickable>
                    <Td style={{ color: atrasado ? "#dc2626" : undefined, fontWeight: atrasado ? 700 : undefined }}>
                      {fmtDate(d.data_vencimento)}
                    </Td>
                    <Td>
                      <div style={{ fontSize: "12px", fontWeight: 500 }}>{d.descricao}</div>
                      {d.fornecedor && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{d.fornecedor}</div>}
                    </Td>
                    <Td>
                      <Badge variant="default">{d.categoria.replace(/_/g, " ")}</Badge>
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 700, color: d.pago ? "#64748b" : "#dc2626" }}>
                      {fmtBRL(d.valor)}
                    </Td>
                    <Td>
                      {d.pago
                        ? <Badge variant="success">✓ Pago {fmtDate(d.data_pagamento)}</Badge>
                        : atrasado
                          ? <Badge variant="danger">⚠ Atrasado</Badge>
                          : <Badge variant="warning">Pendente</Badge>
                      }
                    </Td>
                    <Td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                        {d.pago
                          ? <ActionBtn title="Desfazer pagamento" disabled={salvandoId === d.id} onClick={() => marcarPago(d.id, false)}>↩</ActionBtn>
                          : <ActionBtn title="Marcar como pago" variant="success" disabled={salvandoId === d.id} onClick={() => marcarPago(d.id, true)}>✓</ActionBtn>
                        }
                        <ActionBtn title="Excluir" variant="danger" onClick={() => excluir(d.id, d.descricao)}>✕</ActionBtn>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: cards */}
          <MobileList count={sortedData.length} label="despesas">
            {sortedData.map(d => {
              const atrasado = !d.pago && d.data_vencimento < hoje_;
              return (
                <MobileCard
                  key={d.id}
                  onClick={() => abrirEditar(d)}
                  title={d.descricao}
                  subtitle={d.fornecedor ?? d.categoria.replace(/_/g, " ")}
                  badge={
                    d.pago ? <Badge variant="success">✓ Pago</Badge>
                    : atrasado ? <Badge variant="danger">Atrasado</Badge>
                    : <Badge variant="warning">Pendente</Badge>
                  }
                  highlight={atrasado ? "#dc2626" : d.pago ? "#16a34a" : "#eab308"}
                  details={[
                    { label: "Venc.", value: fmtDate(d.data_vencimento) },
                    { label: "Valor", value: fmtBRL(d.valor) },
                  ]}
                  actions={
                    <div style={{ display: "flex", gap: "6px" }}>
                      {d.pago
                        ? <Btn size="xs" variant="outline" disabled={salvandoId === d.id} loading={salvandoId === d.id} onClick={() => marcarPago(d.id, false)}>↩ Desfazer</Btn>
                        : <Btn size="xs" variant="outline" disabled={salvandoId === d.id} loading={salvandoId === d.id} onClick={() => marcarPago(d.id, true)}>✓ Pagar</Btn>
                      }
                      <Btn size="xs" variant="danger" onClick={() => excluir(d.id, d.descricao)}>✕ Excluir</Btn>
                    </div>
                  }
                />
              );
            })}
          </MobileList>

          <MobileFAB onClick={abrirNovo} label="Nova Despesa" />
          </>
        )}

      {/* Modal CRUD */}
      {modalAberto && (
        <div className="m-modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "flex-start", justifyContent: "center", zIndex: 1000, overflowY: "auto",
          padding: "40px 16px",
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>
              {editandoId ? "Editar Despesa" : "Nova Despesa Avulsa"}
            </h2>

            <FormSection>
              <FormField label="Descrição *">
                <input style={inputStyle} value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Pedágio BR-116" />
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <FormField label="Categoria *">
                  <select style={selectStyle} value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </FormField>
                <FormField label="Valor (R$) *">
                  <input type="text" inputMode="decimal" style={inputStyle} value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder="150,00" />
                </FormField>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <FormField label="Data de Vencimento *">
                  <input type="date" style={inputStyle} value={form.data_vencimento}
                    onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
                </FormField>
                <FormField label="Forma de Pagamento">
                  <select style={selectStyle} value={form.forma_pagamento}
                    onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}>
                    <option value="">Não informado</option>
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartão Débito</option>
                    <option value="cartao_credito">Cartão Crédito</option>
                    <option value="boleto">Boleto</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Fornecedor / Credor">
                <input style={inputStyle} value={form.fornecedor}
                  onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Ex: Posto Shell" />
              </FormField>

              <FormField label="Observações">
                <textarea style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </FormField>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f0fdf4", borderRadius: "8px" }}>
                <input type="checkbox" id="chk-pago" checked={form.pago}
                  onChange={e => setForm(f => ({ ...f, pago: e.target.checked, data_pagamento: e.target.checked ? hoje_ : "" }))} />
                <label htmlFor="chk-pago" style={{ fontSize: "13px", fontWeight: 600, color: "#16a34a", cursor: "pointer" }}>Já pago</label>
                {form.pago && (
                  <input type="date" value={form.data_pagamento}
                    onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))}
                    style={{ ...inputStyle, width: "auto", marginLeft: "auto", padding: "4px 8px", fontSize: "12px" }} />
                )}
              </div>
            </FormSection>

            <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={fecharModal} disabled={salvando}>Cancelar</Btn>
              {editandoId && (
                <Btn variant="danger" onClick={() => excluir(editandoId, form.descricao)} disabled={salvando || excluindo} loading={excluindo}>
                  {excluindo ? "Excluindo..." : "Excluir"}
                </Btn>
              )}
              <Btn variant="primary" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editandoId ? "Salvar" : "Criar Despesa"}
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
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#dc2626", margin: "0 0 8px" }}>Excluir despesa</h2>
            <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 4px" }}>
              <strong>{confirmExcluir.descricao}</strong>
            </p>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 20px" }}>
              Esta ação não pode ser desfeita.
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

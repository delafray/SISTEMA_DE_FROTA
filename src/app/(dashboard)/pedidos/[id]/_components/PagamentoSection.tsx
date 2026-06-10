"use client";

/**
 * Seção 💳 Pagamento do detalhe do pedido (decisão do dono, 10/06/2026:
 * "o pedido é tratado dentro do pedido" — forma de pagamento, parcelas e
 * empresa de faturamento moram AQUI, não no Despacho).
 *
 * - forma_pagamento + empresa_faturamento_id: edição inline no próprio card.
 * - Parcelas: tabela pedido_parcelas (valor + vencimento + baixa individual).
 *   Pedido SEM parcelas continua no modo "pagamento único" (pedidos.pago),
 *   como sempre foi. Gerar parcelas divide o valor do pedido em N iguais
 *   (sobra de centavos vai na última).
 * - Quando TODAS as parcelas são pagas, pedidos.pago é sincronizado = true
 *   (e vice-versa ao estornar) — mantém o A Receber e os relatórios coerentes.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormSection, Btn, Badge, inputStyle, selectStyle } from "@/components/ui/ds";

type Parcela = {
  id: string;
  numero: number;
  valor: number;
  vencimento: string | null;
  pago: boolean;
  data_pagamento: string | null;
};

type Empresa = { id: string; nome_fantasia: string | null; razao_social: string | null };

const fmtBRL = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function PagamentoSection({
  pedidoId,
  empresaId,
  valorPedido,
  pago,
  dataPagamento,
  formaPagamento,
  empresaFaturamentoId,
}: {
  pedidoId: string;
  empresaId: string | null;
  valorPedido: number | null;
  pago: boolean | null;
  dataPagamento: string | null;
  formaPagamento: string | null;
  empresaFaturamentoId: string | null;
}) {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [editando, setEditando] = useState(false);
  const [forma, setForma] = useState(formaPagamento ?? "");
  const [empFat, setEmpFat] = useState(empresaFaturamentoId ?? "");
  const [qtdGerar, setQtdGerar] = useState("3");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [pagoLocal, setPagoLocal] = useState(!!pago);

  const supabase = createClient();

  const carregarParcelas = useCallback(async () => {
    // colunas novas da migration_pedido_faturamento_parcelas; regenerar database.types.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("pedido_parcelas")
      .select("id,numero,valor,vencimento,pago,data_pagamento")
      .eq("pedido_id", pedidoId)
      .order("numero", { ascending: true });
    setParcelas((data ?? []) as Parcela[]);
  }, [pedidoId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarParcelas();
    supabase.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia")
      .then(({ data }) => setEmpresas((data ?? []) as Empresa[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  const nomeEmpresa = (id: string | null) => {
    if (!id) return "—";
    const e = empresas.find(x => x.id === id);
    return e?.nome_fantasia ?? e?.razao_social ?? "—";
  };

  // ── salvar forma de pagamento + empresa de faturamento ────────────────────
  const salvarCondicoes = async () => {
    setSalvando(true);
    setErro("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("pedidos").update({
      forma_pagamento: forma.trim() || null,
      empresa_faturamento_id: empFat || null, // coluna nova; regenerar types
    }).eq("id", pedidoId);
    if (error) setErro(error.message);
    else setEditando(false);
    setSalvando(false);
  };

  // ── sincroniza pedidos.pago com o estado das parcelas ─────────────────────
  const sincronizarPagoPedido = async (lista: Parcela[]) => {
    const todasPagas = lista.length > 0 && lista.every(p => p.pago);
    const ultima = [...lista].reverse().find(p => p.data_pagamento);
    await supabase.from("pedidos").update({
      pago: todasPagas,
      data_pagamento: todasPagas ? (ultima?.data_pagamento ?? hojeISO()) : null,
    }).eq("id", pedidoId);
    setPagoLocal(todasPagas);
  };

  // ── gerar N parcelas iguais (sobra de centavos na última) ─────────────────
  const gerarParcelas = async () => {
    const n = parseInt(qtdGerar, 10);
    if (!Number.isFinite(n) || n < 1 || n > 36) { setErro("Quantidade de parcelas inválida (1 a 36)."); return; }
    if (!valorPedido || valorPedido <= 0) { setErro("Defina o valor do pedido antes de gerar parcelas."); return; }
    if (!empresaId) { setErro("Pedido sem empresa."); return; }
    setSalvando(true);
    setErro("");

    const base = Math.floor((valorPedido / n) * 100) / 100;
    const sobra = Math.round((valorPedido - base * n) * 100) / 100;
    const hoje = new Date();
    const rows = Array.from({ length: n }, (_, i) => {
      const venc = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, hoje.getDate());
      return {
        pedido_id: pedidoId,
        empresa_id: empresaId,
        numero: i + 1,
        valor: i === n - 1 ? Math.round((base + sobra) * 100) / 100 : base,
        vencimento: venc.toISOString().slice(0, 10),
        pago: false,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    // regerar = substituir: apaga as NÃO pagas e mantém as pagas? Não — regra
    // simples e segura: só permite gerar quando não existe parcela PAGA.
    if (parcelas.some(p => p.pago)) { setErro("Há parcela já paga — estorne antes de regerar."); setSalvando(false); return; }
    await sb.from("pedido_parcelas").delete().eq("pedido_id", pedidoId);
    const { error } = await sb.from("pedido_parcelas").insert(rows);
    if (error) setErro(error.message);
    else {
      await carregarParcelas();
      await sincronizarPagoPedido(rows.map((r, i) => ({ ...r, id: String(i), data_pagamento: null })) as Parcela[]);
    }
    setSalvando(false);
  };

  const atualizarParcela = async (p: Parcela, patch: Partial<Parcela>) => {
    setSalvando(true);
    setErro("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("pedido_parcelas")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { setErro(error.message); setSalvando(false); return; }
    const lista = parcelas.map(x => x.id === p.id ? { ...x, ...patch } : x);
    setParcelas(lista);
    if ("pago" in patch) await sincronizarPagoPedido(lista);
    setSalvando(false);
  };

  const removerParcelas = async () => {
    if (parcelas.some(p => p.pago)) { setErro("Há parcela paga — estorne antes de remover."); return; }
    if (!window.confirm("Remover todas as parcelas e voltar ao pagamento único?")) return;
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("pedido_parcelas").delete().eq("pedido_id", pedidoId);
    setParcelas([]);
    setSalvando(false);
  };

  const totalParcelas = parcelas.reduce((s, p) => s + (p.valor ?? 0), 0);
  const divergente = valorPedido != null && parcelas.length > 0 &&
    Math.abs(totalParcelas - valorPedido) > 0.01;

  return (
    <FormSection title="💳 Pagamento">
      {/* condições */}
      {!editando ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Forma de pagamento</span>
            <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 500 }}>{formaPagamento || forma || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Empresa de faturamento</span>
            <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 500 }}>{nomeEmpresa(empFat || empresaFaturamentoId)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Situação</span>
            {parcelas.length > 0 ? (
              <Badge variant={parcelas.every(p => p.pago) ? "success" : "warning"}>
                {parcelas.filter(p => p.pago).length}/{parcelas.length} parcelas pagas
              </Badge>
            ) : pagoLocal ? (
              <span style={{ fontSize: "13px", color: "#16a34a", fontWeight: 600 }}>✓ Pago {dataPagamento ? `em ${fmtDate(dataPagamento)}` : ""}</span>
            ) : (
              <span style={{ fontSize: "13px", color: "#eab308", fontWeight: 600 }}>Pendente</span>
            )}
          </div>
          <Btn variant="outline" size="xs" onClick={() => setEditando(true)}>✏️ Editar condições</Btn>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "8px" }}>
          <label style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Forma de pagamento</label>
          <input
            style={inputStyle}
            value={forma}
            onChange={e => setForma(e.target.value)}
            placeholder="PIX, boleto, dinheiro, 30/60/90..."
          />
          <label style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Empresa de faturamento</label>
          <select style={selectStyle} value={empFat} onChange={e => setEmpFat(e.target.value)}>
            <option value="">— Não definida —</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nome_fantasia ?? e.razao_social ?? e.id.slice(0, 8)}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "6px" }}>
            <Btn variant="primary" size="xs" disabled={salvando} onClick={salvarCondicoes}>
              {salvando ? "Salvando..." : "Salvar"}
            </Btn>
            <Btn variant="ghost" size="xs" onClick={() => setEditando(false)}>Cancelar</Btn>
          </div>
        </div>
      )}

      {/* parcelas */}
      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>Parcelas</span>
          {parcelas.length === 0 ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type="number" min={1} max={36}
                style={{ ...inputStyle, width: "56px", padding: "4px 8px" }}
                value={qtdGerar}
                onChange={e => setQtdGerar(e.target.value)}
              />
              <Btn variant="outline" size="xs" disabled={salvando} onClick={gerarParcelas}>Gerar parcelas</Btn>
            </div>
          ) : (
            <button
              onClick={removerParcelas}
              style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
            >
              Remover parcelamento
            </button>
          )}
        </div>

        {erro && <p style={{ fontSize: "12px", color: "#dc2626", margin: "4px 0" }}>{erro}</p>}

        {parcelas.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
            Pagamento único (sem parcelas). Gere parcelas para dividir {fmtBRL(valorPedido)} com vencimentos mensais — depois ajuste valor/data de cada uma.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {divergente && (
              <p style={{ fontSize: "11px", color: "#d97706", margin: "0 0 4px" }}>
                ⚠️ Soma das parcelas ({fmtBRL(totalParcelas)}) difere do valor do pedido ({fmtBRL(valorPedido)}).
              </p>
            )}
            {parcelas.map(p => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "6px 8px", background: p.pago ? "#f0fdf4" : "#f8fafc",
                borderRadius: "8px", border: "1px solid " + (p.pago ? "#bbf7d0" : "#e2e8f0"),
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", minWidth: "28px" }}>{p.numero}ª</span>
                <input
                  type="number" step="0.01" min="0"
                  style={{ ...inputStyle, width: "100px", padding: "4px 8px", fontSize: "12px" }}
                  value={String(p.valor)}
                  disabled={p.pago || salvando}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setParcelas(prev => prev.map(x => x.id === p.id ? { ...x, valor: Number.isFinite(v) ? v : 0 } : x));
                  }}
                  onBlur={e => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && v >= 0) atualizarParcela(p, { valor: Math.round(v * 100) / 100 });
                  }}
                />
                <input
                  type="date"
                  style={{ ...inputStyle, width: "130px", padding: "4px 8px", fontSize: "12px" }}
                  value={p.vencimento ?? ""}
                  disabled={p.pago || salvando}
                  onChange={e => atualizarParcela(p, { vencimento: e.target.value || null })}
                />
                <div style={{ marginLeft: "auto" }}>
                  {p.pago ? (
                    <button
                      onClick={() => atualizarParcela(p, { pago: false, data_pagamento: null })}
                      disabled={salvando}
                      style={{ fontSize: "11px", color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
                      title={p.data_pagamento ? `Paga em ${fmtDate(p.data_pagamento)}` : "Paga"}
                    >
                      ✓ Paga {p.data_pagamento ? fmtDate(p.data_pagamento) : ""} · estornar
                    </button>
                  ) : (
                    <Btn
                      variant="outline" size="xs" disabled={salvando}
                      onClick={() => atualizarParcela(p, { pago: true, data_pagamento: hojeISO() })}
                    >
                      💰 Baixar
                    </Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  );
}

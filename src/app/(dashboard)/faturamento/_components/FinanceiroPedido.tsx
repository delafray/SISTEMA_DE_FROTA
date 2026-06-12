"use client";

/**
 * Painel financeiro do pedido — mora no FINANCEIRO POR CLIENTE (/faturamento),
 * que é a tela PRINCIPAL de recebíveis (decisão do dono, 10/06/2026).
 *
 * Aqui o gestor define o financeiro do pedido depois que ele é lançado:
 *  - empresa de faturamento + forma de pagamento;
 *  - ACRÉSCIMOS e DESCONTOS → total a receber = valor + acréscimos - descontos;
 *  - parcelamento: N parcelas, 1ª vence hoje e as demais a cada +30 dias,
 *    tudo editável — ao salvar o valor de uma parcela, as seguintes NÃO pagas
 *    redistribuem o restante (reconciliação em src/lib/financeiro/parcelas.ts,
 *    a soma NUNCA diverge do total);
 *  - baixa/estorno por parcela (sincroniza pedidos.pago quando todas pagas).
 *
 * Antes da migration_pedido_acrescimos_descontos.sql os campos de acréscimo/
 * desconto aparecem travados com aviso — o resto funciona normal.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Badge, inputStyle, selectStyle } from "@/components/ui/ds";
import {
  totalAReceber, gerarParcelasPadrao, redistribuirAposEdicao, redistribuirNaoPagas,
} from "@/lib/financeiro/parcelas";

type Parcela = {
  id: string;
  numero: number;
  valor: number;
  vencimento: string | null;
  pago: boolean;
  data_pagamento: string | null;
};

export type EmpresaOpcao = { id: string; nome_fantasia: string | null; razao_social: string | null };

const fmtBRL = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function FinanceiroPedido({
  pedidoId,
  empresaId,
  valorPedido,
  empresas,
  onMudou,
}: {
  pedidoId: string;
  empresaId: string;
  valorPedido: number;
  empresas: EmpresaOpcao[];
  /** avisa a tela-mãe pra recarregar os agregados por cliente */
  onMudou: () => void;
}) {
  const supabase = createClient();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  // condições (pedidos)
  const [forma, setForma] = useState("");
  const [empFat, setEmpFat] = useState("");
  const [acrescimos, setAcrescimos] = useState("0");
  const [descontos, setDescontos] = useState("0");
  // null = migration de acréscimos/descontos ainda não rodou
  const [temAjustes, setTemAjustes] = useState<boolean | null>(null);

  // geração de parcelas
  const [qtdGerar, setQtdGerar] = useState("3");
  const [primeiroVenc, setPrimeiroVenc] = useState(hojeISO());
  // edição local dos valores (committa no blur com reconciliação)
  const [valorEdit, setValorEdit] = useState<Record<string, string>>({});

  const total = totalAReceber(valorPedido, parseFloat(acrescimos) || 0, parseFloat(descontos) || 0);
  const somaParcelas = Math.round(parcelas.reduce((s, p) => s + (p.valor ?? 0), 0) * 100) / 100;
  const consolidado = parcelas.length === 0 || Math.abs(somaParcelas - total) <= 0.009;

  const avisar = (msg: string) => { setOk(msg); setTimeout(() => setOk(""), 3500); };

  // ── carga inicial: parcelas + condições do pedido (com fallback pré-migration) ──
  const carregar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: pars } = await sb.from("pedido_parcelas")
      .select("id,numero,valor,vencimento,pago,data_pagamento")
      .eq("pedido_id", pedidoId)
      .order("numero", { ascending: true });
    setParcelas((pars ?? []) as Parcela[]);

    // tenta com acréscimos/descontos (colunas da migration nova); se não
    // existirem ainda, recarrega sem elas e trava os campos com aviso.
    const { data: comAjustes, error } = await sb.from("pedidos")
      .select("forma_pagamento,empresa_faturamento_id,acrescimos,descontos")
      .eq("id", pedidoId).maybeSingle();
    if (!error && comAjustes) {
      setForma(comAjustes.forma_pagamento ?? "");
      setEmpFat(comAjustes.empresa_faturamento_id ?? "");
      setAcrescimos(String(comAjustes.acrescimos ?? 0));
      setDescontos(String(comAjustes.descontos ?? 0));
      setTemAjustes(true);
    } else {
      const { data: basico } = await sb.from("pedidos")
        .select("forma_pagamento,empresa_faturamento_id")
        .eq("id", pedidoId).maybeSingle();
      setForma(basico?.forma_pagamento ?? "");
      setEmpFat(basico?.empresa_faturamento_id ?? "");
      setTemAjustes(false);
    }
    setCarregando(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    carregar();
  }, [carregar]);

  // ── sincroniza pedidos.pago com o estado das parcelas ─────────────────────
  const sincronizarPagoPedido = async (lista: Parcela[]) => {
    const todasPagas = lista.length > 0 && lista.every(p => p.pago);
    const ultima = [...lista].reverse().find(p => p.data_pagamento);
    await supabase.from("pedidos").update({
      pago: todasPagas,
      data_pagamento: todasPagas ? (ultima?.data_pagamento ?? hojeISO()) : null,
    }).eq("id", pedidoId);
  };

  // ── salvar condições (forma, empresa, acréscimos/descontos) ───────────────
  const salvarCondicoes = async () => {
    setSalvando(true);
    setErro("");
    const acr = Math.round((parseFloat(acrescimos) || 0) * 100) / 100;
    const desc = Math.round((parseFloat(descontos) || 0) * 100) / 100;
    if (acr < 0 || desc < 0) { setErro("Acréscimos e descontos não podem ser negativos."); setSalvando(false); return; }
    const novoTotal = totalAReceber(valorPedido, acr, desc);
    if (novoTotal <= 0) { setErro("Total a receber ficou zerado/negativo — confira os descontos."); setSalvando(false); return; }

    // Reconciliação: parcelas abertas redistribuem pro novo total ANTES de gravar.
    let novosValores: number[] | null = null;
    if (parcelas.length > 0) {
      const r = redistribuirNaoPagas(parcelas, novoTotal);
      if ("erro" in (r as object)) { setErro((r as { erro: string }).erro); setSalvando(false); return; }
      novosValores = r as number[];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const patch: Record<string, unknown> = {
      forma_pagamento: forma.trim() || null,
      empresa_faturamento_id: empFat || null,
    };
    if (temAjustes) { patch.acrescimos = acr; patch.descontos = desc; }
    const { error } = await sb.from("pedidos").update(patch).eq("id", pedidoId);
    if (error) { setErro(error.message); setSalvando(false); return; }

    if (novosValores) {
      const mudadas = parcelas.filter((p, i) => Math.abs(p.valor - novosValores![i]) > 0.009);
      await Promise.all(mudadas.map(p => {
        const i = parcelas.findIndex(x => x.id === p.id);
        return sb.from("pedido_parcelas").update({ valor: novosValores![i], updated_at: new Date().toISOString() }).eq("id", p.id);
      }));
      setParcelas(prev => prev.map((p, i) => ({ ...p, valor: novosValores![i] })));
    }
    avisar("✓ Condições salvas" + (novosValores ? " — parcelas reconciliadas." : "."));
    onMudou();
    setSalvando(false);
  };

  // ── gerar parcelas (1ª hoje, +30 dias cada, centavos na última) ───────────
  const gerarParcelas = async () => {
    setErro("");
    if (parcelas.some(p => p.pago)) { setErro("Há parcela já paga — estorne antes de regerar."); return; }
    const n = parseInt(qtdGerar, 10);
    const r = gerarParcelasPadrao(total, n, primeiroVenc || hojeISO());
    if ("erro" in (r as object)) { setErro((r as { erro: string }).erro); return; }
    const novas = r as Array<{ numero: number; valor: number; vencimento: string }>;

    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await sb.from("pedido_parcelas").delete().eq("pedido_id", pedidoId);
    const { error } = await sb.from("pedido_parcelas").insert(novas.map(p => ({
      pedido_id: pedidoId,
      empresa_id: empresaId,
      numero: p.numero,
      valor: p.valor,
      vencimento: p.vencimento,
      pago: false,
    })));
    if (error) setErro(error.message);
    else {
      await carregar();
      await supabase.from("pedidos").update({ pago: false, data_pagamento: null }).eq("id", pedidoId);
      avisar(`✓ ${novas.length} parcela${novas.length > 1 ? "s" : ""} gerada${novas.length > 1 ? "s" : ""}.`);
      onMudou();
    }
    setSalvando(false);
  };

  const removerParcelas = async () => {
    if (parcelas.some(p => p.pago)) { setErro("Há parcela paga — estorne antes de remover."); return; }
    if (!window.confirm("Remover todas as parcelas e voltar ao pagamento único?")) return;
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("pedido_parcelas").delete().eq("pedido_id", pedidoId);
    setParcelas([]);
    onMudou();
    setSalvando(false);
  };

  // ── salvar valor de UMA parcela → cascata nas seguintes não pagas ─────────
  const salvarValorParcela = async (parcela: Parcela) => {
    const texto = valorEdit[parcela.id];
    if (texto == null) return; // nada editado
    const v = parseFloat(texto.replace(",", "."));
    setErro("");

    const idx = parcelas.findIndex(p => p.id === parcela.id);
    const r = redistribuirAposEdicao(
      parcelas.map(p => ({ numero: p.numero, valor: p.valor, pago: p.pago })),
      idx, v, total
    );
    if ("erro" in (r as object)) {
      setErro((r as { erro: string }).erro);
      setValorEdit(prev => { const n = { ...prev }; delete n[parcela.id]; return n; });
      return;
    }
    const novos = r as number[];

    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const mudadas = parcelas.filter((p, i) => Math.abs(p.valor - novos[i]) > 0.009);
    await Promise.all(mudadas.map(p => {
      const i = parcelas.findIndex(x => x.id === p.id);
      return sb.from("pedido_parcelas").update({ valor: novos[i], updated_at: new Date().toISOString() }).eq("id", p.id);
    }));
    setParcelas(prev => prev.map((p, i) => ({ ...p, valor: novos[i] })));
    setValorEdit(prev => { const n = { ...prev }; delete n[parcela.id]; return n; });
    const seguintes = mudadas.filter(p => p.id !== parcela.id).length;
    avisar(seguintes > 0 ? `✓ Parcela salva — ${seguintes} seguinte${seguintes > 1 ? "s" : ""} reconciliada${seguintes > 1 ? "s" : ""}.` : "✓ Parcela salva.");
    onMudou();
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
    if ("pago" in patch) { await sincronizarPagoPedido(lista); onMudou(); }
    setSalvando(false);
  };

  const nomeEmpresa = (e: EmpresaOpcao) => e.nome_fantasia ?? e.razao_social ?? e.id.slice(0, 8);

  if (carregando) return <p style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0" }}>Carregando financeiro…</p>;

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px", margin: "6px 0 10px" }}>

      {/* ── condições ─────────────────────────────────────────────────────── */}
      <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", alignItems: "end" }}>
        <div>
          <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>Empresa de faturamento</label>
          <select style={{ ...selectStyle, fontSize: "12px", padding: "6px 8px" }} value={empFat} onChange={e => setEmpFat(e.target.value)}>
            <option value="">— A definir —</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>Forma de pagamento</label>
          <input style={{ ...inputStyle, fontSize: "12px", padding: "6px 8px" }} value={forma}
            onChange={e => setForma(e.target.value)} placeholder="PIX, boleto, 30/60/90…" />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>Acréscimos (R$)</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" disabled={temAjustes === false}
            style={{ ...inputStyle, fontSize: "12px", padding: "6px 8px" }} value={acrescimos}
            onChange={e => setAcrescimos(e.target.value)}
            title={temAjustes === false ? "Rode db/migration_pedido_acrescimos_descontos.sql" : undefined} />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>Descontos (R$)</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" disabled={temAjustes === false}
            style={{ ...inputStyle, fontSize: "12px", padding: "6px 8px" }} value={descontos}
            onChange={e => setDescontos(e.target.value)}
            title={temAjustes === false ? "Rode db/migration_pedido_acrescimos_descontos.sql" : undefined} />
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>Total a receber</div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#16a34a", padding: "4px 0" }}>{fmtBRL(total)}</div>
        </div>
        <div>
          <Btn variant="primary" size="xs" disabled={salvando} onClick={salvarCondicoes}>
            {salvando ? "Salvando…" : "💾 Salvar"}
          </Btn>
        </div>
      </div>

      {temAjustes === false && (
        <p style={{ fontSize: "11px", color: "#d97706", margin: "6px 0 0" }}>
          ⚠ Acréscimos/descontos exigem a migration <code>db/migration_pedido_acrescimos_descontos.sql</code>.
        </p>
      )}
      {valorPedido <= 0 && (
        <p style={{ fontSize: "11px", color: "#d97706", margin: "6px 0 0" }}>
          ⚠ Pedido sem valor — defina o valor em Editar pedido antes de parcelar.
        </p>
      )}

      {/* ── parcelas ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
            Parcelas
            {parcelas.length > 0 && (
              consolidado
                ? <Badge variant="success"> ✓ consolidado</Badge>
                : <Badge variant="danger"> ⚠ soma {fmtBRL(somaParcelas)} ≠ total {fmtBRL(total)}</Badge>
            )}
          </span>
          {parcelas.length === 0 ? (
            <div className="m-stack" style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Dividir em</span>
              <input type="number" min={1} max={36} inputMode="numeric" style={{ ...inputStyle, width: "52px", padding: "4px 6px", fontSize: "12px" }}
                value={qtdGerar} onChange={e => setQtdGerar(e.target.value)} />
              <span style={{ fontSize: "11px", color: "#64748b" }}>x, 1ª vence</span>
              <input type="date" style={{ ...inputStyle, padding: "4px 6px", fontSize: "12px" }}
                value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} />
              <Btn variant="outline" size="xs" disabled={salvando || total <= 0} onClick={gerarParcelas}>Gerar parcelas</Btn>
            </div>
          ) : (
            <button onClick={removerParcelas} disabled={salvando}
              style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: salvando ? "not-allowed" : "pointer", opacity: salvando ? 0.5 : 1 }}>
              Remover parcelamento
            </button>
          )}
        </div>

        {erro && <p role="alert" style={{ fontSize: "12px", color: "#dc2626", margin: "4px 0" }}>{erro}</p>}
        {ok && <p role="status" style={{ fontSize: "12px", color: "#16a34a", margin: "4px 0", fontWeight: 600 }}>{ok}</p>}

        {parcelas.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
            Pagamento único (sem parcelas). As demais ({"+30"} dias cada) são geradas dividindo {fmtBRL(total)} — depois ajuste o valor de qualquer parcela que as seguintes se reconciliam sozinhas.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {parcelas.map(p => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
                padding: "6px 8px", background: p.pago ? "#f0fdf4" : "#fff",
                borderRadius: "8px", border: "1px solid " + (p.pago ? "#bbf7d0" : "#e2e8f0"),
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", minWidth: "26px" }}>{p.numero}ª</span>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  style={{ ...inputStyle, width: "90px", padding: "4px 8px", fontSize: "12px" }}
                  value={valorEdit[p.id] ?? String(p.valor)}
                  disabled={p.pago || salvando}
                  onChange={e => setValorEdit(prev => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={() => salvarValorParcela(p)}
                  title="Ao salvar, as parcelas seguintes não pagas redistribuem o restante"
                />
                <input
                  type="date"
                  style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px" }}
                  value={p.vencimento ?? ""}
                  disabled={p.pago || salvando}
                  onChange={e => atualizarParcela(p, { vencimento: e.target.value || null })}
                />
                {!p.pago && p.vencimento && p.vencimento < hojeISO() && (
                  <Badge variant="danger">vencida</Badge>
                )}
                <div style={{ marginLeft: "auto" }}>
                  {p.pago ? (
                    <button
                      onClick={() => atualizarParcela(p, { pago: false, data_pagamento: null })}
                      disabled={salvando}
                      style={{ fontSize: "11px", color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
                    >
                      ✓ Paga {p.data_pagamento ? fmtDate(p.data_pagamento) : ""} · estornar
                    </button>
                  ) : (
                    <Btn variant="outline" size="xs" disabled={salvando}
                      onClick={() => atualizarParcela(p, { pago: true, data_pagamento: hojeISO() })}>
                      💰 Baixar
                    </Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * Tabelas e Campos da regra — matriz Colunas × Ações (Consulta/Altera/Inclui).
 * Igual ao Autorizações, mas pra dados: marca, por coluna, o que ESTA regra pode.
 * Salva no escopo_dados.colunas; o motor de execução gera o SQL determinístico disso.
 * Só mostra colunas de NEGÓCIO (esconde id, *_id, empresa_id, timestamps).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Btn } from "@/components/ui/ds";

// Tabelas seguras + colunas de negócio (curado — nunca auth/perfis/telefones/regras).
const CAMPOS: { tabela: string; colunas: string[] }[] = [
  { tabela: "veiculos",       colunas: ["placa", "apelido", "marca", "modelo", "ano", "tipo", "combustivel", "km_atual", "km_proxima_revisao", "ipva_vencimento", "ativo"] },
  { tabela: "motoristas",     colunas: ["nome", "cpf", "whatsapp", "cnh_numero", "cnh_categoria", "cnh_validade", "cargo", "salario_fixo", "valor_diaria_por_pedido", "ativo"] },
  { tabela: "alocacoes",      colunas: ["status", "km_evento", "km_fim", "inicio", "fim", "observacao"] },
  { tabela: "abastecimentos", colunas: ["litros", "valor_litro", "valor_total", "posto", "km_no_abast", "pago"] },
  { tabela: "manutencoes",    colunas: ["descricao", "status", "km_realizada", "km_proxima", "data_proxima", "custo_total", "fornecedor", "pago"] },
  { tabela: "avarias",        colunas: ["descricao_motorista", "status", "urgencia", "resolvido_em"] },
  { tabela: "pedidos",        colunas: ["status", "data_inicio_prevista", "km_inicial", "km_final", "valor_pedido", "pago"] },
  { tabela: "clientes",       colunas: ["nome_fantasia", "documento", "telefone", "email", "cidade", "uf", "ativo"] },
  { tabela: "lembretes",      colunas: ["texto", "origem", "ciente_em", "criado_por_nome"] },
];

const ACOES = [
  { key: "consultar", label: "Consulta", bg: "#dbeafe", color: "#1d4ed8" },
  { key: "alterar",   label: "Altera",   bg: "#fef3c7", color: "#b45309" },
  { key: "registrar", label: "Inclui",   bg: "#dcfce7", color: "#15803d" },
] as const;

type Colunas = Record<string, Record<string, string[]>>; // { tabela: { coluna: acao[] } }

const COL_LBL = 90, COL = 26, HEAD_H = 150;

export default function DadosRegraPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const supabase = useMemo(() => createClient(), []);
  const [nome, setNome] = useState("");
  const [acoesRegra, setAcoesRegra] = useState<string[]>([]);
  const [escopo, setEscopo] = useState<Record<string, unknown>>({});
  const [colunas, setColunas] = useState<Colunas>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data } = await supabase.from("regras").select("nome,acoes,escopo_dados").eq("id", id).maybeSingle();
      if (data) {
        setNome(data.nome);
        setAcoesRegra(data.acoes ?? []);
        const esc = (data.escopo_dados as Record<string, unknown>) ?? {};
        setEscopo(esc);
        setColunas((esc.colunas as Colunas) ?? {});
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcado = (t: string, c: string, a: string) => (colunas[t]?.[c] ?? []).includes(a);
  const podeAcao = (a: string) => acoesRegra.includes(a);

  const toggle = (t: string, c: string, a: string) => {
    if (!podeAcao(a)) return;
    setColunas((prev) => {
      const next: Colunas = JSON.parse(JSON.stringify(prev));
      const cur = next[t]?.[c] ?? [];
      const novo = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a];
      if (!next[t]) next[t] = {};
      if (novo.length) next[t][c] = novo;
      else { delete next[t][c]; if (!Object.keys(next[t]).length) delete next[t]; }
      return next;
    });
  };

  const salvar = async () => {
    setMsg("");
    const { error } = await supabase.from("regras")
      .update({ escopo_dados: { ...escopo, colunas }, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    setMsg(error ? `Erro: ${error.message}` : "Salvo ✓");
    setTimeout(() => setMsg(""), 2500);
  };

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>;

  const cell: React.CSSProperties = { borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9", textAlign: "center", height: 34 };
  const headBg = "#1e293b";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>
      <PageHeader title={`Tabelas e campos — ${nome}`} actions={
        <>
          <Btn href={`/regras/${id}/editar`} variant="ghost">← Voltar</Btn>
          <Btn onClick={salvar}>Salvar</Btn>
        </>
      } />

      <div style={{ padding: "8px 14px", fontSize: 12, color: "#64748b", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        Marque, por <b>coluna</b>, o que <b>esta regra</b> pode: <b style={{ color: "#1d4ed8" }}>Consulta</b> (lê) · <b style={{ color: "#b45309" }}>Altera</b> (muda) · <b style={{ color: "#15803d" }}>Inclui</b> (cria).
        As ações <b>fora do Acesso da regra</b> ({acoesRegra.join(", ") || "—"}) ficam travadas. {msg && <b style={{ marginLeft: 10, color: "#16a34a" }}>{msg}</b>}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content" }}>
          <thead>
            {/* nomes das tabelas (agrupando) */}
            <tr>
              <th style={{ position: "sticky", left: 0, top: 0, zIndex: 6, width: COL_LBL, minWidth: COL_LBL, background: headBg, color: "#fff", borderRight: "2px solid #475569" }} />
              {CAMPOS.map((g) => (
                <th key={g.tabela} colSpan={g.colunas.length}
                  style={{ position: "sticky", top: 0, zIndex: 4, background: "#0f172a", color: "#e2e8f0", fontSize: 11, fontWeight: 700, padding: "4px 6px", textAlign: "left", borderRight: "2px solid #475569", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  {g.tabela}
                </th>
              ))}
            </tr>
            {/* colunas (90°) */}
            <tr>
              <th style={{ position: "sticky", left: 0, top: 22, zIndex: 6, width: COL_LBL, minWidth: COL_LBL, background: headBg, color: "#94a3b8", fontSize: 10, padding: "0 6px", textAlign: "right", borderRight: "2px solid #475569" }}>ação ↓</th>
              {CAMPOS.flatMap((g) =>
                g.colunas.map((c, i) => (
                  <th key={g.tabela + c} style={{ position: "sticky", top: 22, zIndex: 4, background: headBg, color: "#e2e8f0", width: COL, minWidth: COL, height: HEAD_H, padding: 0, borderRight: i === g.colunas.length - 1 ? "2px solid #475569" : "1px solid #334155" }}>
                    <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", margin: "0 auto", fontSize: 11, padding: "6px 0" }}>{c}</div>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {ACOES.map((a) => {
              const ativa = podeAcao(a.key);
              return (
                <tr key={a.key}>
                  <td style={{ position: "sticky", left: 0, zIndex: 3, width: COL_LBL, minWidth: COL_LBL, background: ativa ? "#fff" : "#f1f5f9", color: ativa ? a.color : "#cbd5e1", fontWeight: 700, fontSize: 12, padding: "0 8px", borderRight: "2px solid #cbd5e1", borderBottom: "1px solid #eef2f7" }}>
                    {a.label}{!ativa && " 🔒"}
                  </td>
                  {CAMPOS.flatMap((g) =>
                    g.colunas.map((c, i) => {
                      const on = marcado(g.tabela, c, a.key);
                      return (
                        <td key={g.tabela + c + a.key} style={{ ...cell, borderRight: i === g.colunas.length - 1 ? "2px solid #cbd5e1" : "1px solid #f1f5f9", background: !ativa ? "#f8fafc" : on ? a.bg : "#fff" }}>
                          <button type="button" onClick={() => toggle(g.tabela, c, a.key)} disabled={!ativa}
                            title={ativa ? `${g.tabela}.${c} — ${a.label}` : "Ação fora do Acesso desta regra"}
                            style={{ width: "100%", height: 34, border: "none", background: "transparent", cursor: ativa ? "pointer" : "not-allowed", color: a.color, fontWeight: 900, fontSize: 14 }}>
                            {on ? "✓" : ""}
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

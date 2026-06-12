"use client";

/**
 * Tabelas e Campos da regra — matriz Colunas × Ações (Consulta/Altera/Inclui).
 * Igual ao Autorizações, mas pra dados: marca, por coluna, o que ESTA regra pode.
 * Salva no escopo_dados.colunas; o motor de execução gera o SQL determinístico disso.
 * Só mostra colunas de NEGÓCIO (esconde id, *_id, empresa_id, timestamps).
 *
 * Seção extra: quando a regra tem ação "registrar", exibe o editor de
 * escopo_dados.escrita (config do executor de escrita genérica do bot).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { temSessao } from "@/lib/auth/temSessao";
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
  { tabela: "entregas",       colunas: ["status", "destino", "nome_cliente_avulso", "data_entrega_prevista", "data_fim", "peso_carga_kg"] },
  { tabela: "clientes",       colunas: ["nome_fantasia", "documento", "telefone", "email", "cidade", "uf", "ativo"] },
  { tabela: "lembretes",      colunas: ["texto", "origem", "ciente_em", "criado_por_nome"] },
];

const ACOES = [
  { key: "consultar", label: "Consulta", bg: "#dbeafe", color: "#1d4ed8" },
  { key: "alterar",   label: "Altera",   bg: "#fef3c7", color: "#b45309" },
  { key: "registrar", label: "Inclui",   bg: "#dcfce7", color: "#15803d" },
] as const;

type Colunas = Record<string, Record<string, string[]>>; // { tabela: { coluna: acao[] } }

// --- Tipos para escrita ---
type TipoCampo = "texto" | "numero" | "data";
type CampoEscrita = {
  campo: string;
  rotulo?: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  pergunta?: string;
};
type EscopoEscrita = {
  tabela: string;
  acao: "registrar";
  sem_empresa_id?: boolean;
  fixos?: Record<string, string | number | boolean>;
  campos: CampoEscrita[];
};

const COL_LBL = 90, COL = 26, HEAD_H = 150;

// Tempo (ms) em que um aviso de validação ainda permite "salvar mesmo assim".
const SALVAR_MESMO_ASSIM_MS = 10_000;

/** Cria um campo vazio para adicionar na lista. */
function campoVazio(): CampoEscrita {
  return { campo: "", rotulo: "", tipo: "texto", obrigatorio: false, pergunta: "" };
}

export default function DadosRegraPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const supabase = useMemo(() => createClient(), []);
  const [nome, setNome] = useState("");
  const [acoesRegra, setAcoesRegra] = useState<string[]>([]);
  const [escopo, setEscopo] = useState<Record<string, unknown>>({});
  const [colunas, setColunas] = useState<Colunas>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [temAvisoValidacao, setTemAvisoValidacao] = useState(false);

  // Estado da seção de escrita
  const [tabelaEscrita, setTabelaEscrita] = useState("");
  const [semEmpresaId, setSemEmpresaId] = useState(false);
  const [camposEscrita, setCamposEscrita] = useState<CampoEscrita[]>([]);

  // Ref para o "salvar mesmo assim" (guarda o timestamp do último aviso)
  const avisoValidacaoTs = useRef<number>(0);
  // Preservar o valor de fixos do banco (não exposto na UI v1)
  const fixosPreservados = useRef<Record<string, string | number | boolean> | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      if (!(await temSessao())) { router.replace("/login"); return; }
      const { data } = await supabase.from("regras").select("nome,acoes,escopo_dados").eq("id", id).maybeSingle();
      if (data) {
        setNome(data.nome);
        setAcoesRegra(data.acoes ?? []);
        const esc = (data.escopo_dados as Record<string, unknown>) ?? {};
        setEscopo(esc);
        setColunas((esc.colunas as Colunas) ?? {});

        // Carregar escrita salva
        const escrita = esc.escrita as EscopoEscrita | undefined;
        if (escrita) {
          setTabelaEscrita(escrita.tabela ?? "");
          setSemEmpresaId(escrita.sem_empresa_id ?? false);
          setCamposEscrita(escrita.campos ?? []);
          fixosPreservados.current = escrita.fixos;
        }
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

  // Colunas disponíveis para a tabela selecionada na seção de escrita
  const colunasDisponiveis = CAMPOS.find((g) => g.tabela === tabelaEscrita)?.colunas ?? [];

  // Monta o objeto escrita para salvar (undefined se sem tabela)
  const montarEscrita = (): EscopoEscrita | undefined => {
    if (!tabelaEscrita) return undefined;
    const obj: EscopoEscrita = {
      tabela: tabelaEscrita,
      acao: "registrar",
      campos: camposEscrita,
    };
    if (semEmpresaId) obj.sem_empresa_id = true;
    if (fixosPreservados.current && Object.keys(fixosPreservados.current).length > 0) {
      obj.fixos = fixosPreservados.current;
    }
    return obj;
  };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setMsg("");

    // Montar escopo_dados final
    const escritaFinal = montarEscrita();
    const escopoDadosFinal: Record<string, unknown> = { ...escopo, colunas };
    if (escritaFinal) escopoDadosFinal.escrita = escritaFinal;
    else delete escopoDadosFinal.escrita; // não gravar chave vazia

    try {
      // --- Validação antes de gravar ---
      const agora = Date.now();
      const temAvisoRecente = agora - avisoValidacaoTs.current < SALVAR_MESMO_ASSIM_MS;

      if (!temAvisoRecente) {
        try {
          const res = await fetch("/api/regras/validar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ escopo_dados: escopoDadosFinal }),
          });
          if (res.ok) {
            const { ok: valOk, problemas } = await res.json() as {
              ok: boolean;
              problemas: { tabela: string; coluna: string; tipo: string; detalhe: string }[];
            };
            if (!valOk && problemas.length > 0) {
              avisoValidacaoTs.current = Date.now();
              const lista = problemas.map((p) => `${p.tabela}.${p.coluna} (${p.tipo})`).join(", ");
              setMsg(`Problemas encontrados: ${lista}`);
              setTemAvisoValidacao(true);
              return; // não salva
            }
          }
          // Se res não ok (ex: 500), ignora e segue salvando (infra não bloqueia)
        } catch {
          // Falha de rede — segue com save normal
        }
      }

      // Gravar (cast via JSON para satisfazer o tipo Json do Supabase)
      const { error } = await supabase.from("regras")
        .update({ escopo_dados: JSON.parse(JSON.stringify(escopoDadosFinal)), atualizado_em: new Date().toISOString() })
        .eq("id", id);
      avisoValidacaoTs.current = 0; // resetar após salvar
      setTemAvisoValidacao(false);
      setMsg(error ? `Erro: ${error.message}` : "Salvo ✓");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>;

  const cell: React.CSSProperties = { borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9", textAlign: "center", height: 34 };
  const headBg = "#1e293b";

  // Estilo reutilizado na seção de escrita
  const labelSty: React.CSSProperties = { fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 4, display: "block" };
  const inputSty: React.CSSProperties = { fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 6px", background: "#fff", color: "#1e293b" };
  const selectSty: React.CSSProperties = { ...inputSty, cursor: "pointer" };
  const thSty: React.CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 600, padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
  const tdSty: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };

  const temRegistrar = acoesRegra.includes("registrar");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" }}>
      <PageHeader title={`Tabelas e campos — ${nome}`} actions={
        <>
          <Btn href={`/regras/${id}/editar`} variant="ghost">← Voltar</Btn>
          {temAvisoValidacao ? (
            <Btn onClick={salvar} loading={salvando} variant="danger">Salvar mesmo assim</Btn>
          ) : (
            <Btn onClick={salvar} loading={salvando}>Salvar</Btn>
          )}
        </>
      } />

      {temAvisoValidacao && msg && (
        <div role="alert" style={{ padding: "10px 14px", background: "#fffbeb", border: "none", borderBottom: "2px solid #fcd34d", color: "#92400e", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <span>⚠️ {msg} — Clique em <b>Salvar mesmo assim</b> para gravar com esses problemas.</span>
          <button onClick={() => { setMsg(""); setTemAvisoValidacao(false); avisoValidacaoTs.current = 0; }} style={{ border: "none", background: "none", cursor: "pointer", color: "#92400e", fontWeight: 700, fontSize: 16, lineHeight: 1, flexShrink: 0, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      )}

      {!temAvisoValidacao && msg && (
        <div role="status" style={{ padding: "8px 14px", background: msg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", borderBottom: `1px solid ${msg.startsWith("Erro") ? "#fecaca" : "#bbf7d0"}`, color: msg.startsWith("Erro") ? "#b91c1c" : "#15803d", fontSize: 13 }}>
          {msg}
        </div>
      )}

      <div style={{ padding: "8px 14px", fontSize: 12, color: "#64748b", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        Marque, por <b>coluna</b>, o que <b>esta regra</b> pode: <b style={{ color: "#1d4ed8" }}>Consulta</b> (lê) · <b style={{ color: "#b45309" }}>Altera</b> (muda) · <b style={{ color: "#15803d" }}>Inclui</b> (cria).
        As ações <b>fora do Acesso da regra</b> ({acoesRegra.join(", ") || "—"}) ficam travadas.
      </div>

      {/* Matriz de colunas × ações — desktop */}
      <div className="m-hide" style={{ flex: "none", overflow: "auto", maxHeight: "60vh" }}>
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

      {/* Variante mobile: lista vertical por tabela, colunas com toggles de ação */}
      <div className="m-show-block" style={{ flex: 1, overflow: "auto", padding: "8px 12px 24px" }}>
        {CAMPOS.map((g) => (
          <div key={g.tabela} style={{ marginBottom: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ background: "#0f172a", color: "#e2e8f0", fontSize: 11, fontWeight: 700, padding: "6px 12px", textTransform: "uppercase", letterSpacing: ".04em" }}>
              {g.tabela}
            </div>
            {g.colunas.map((c) => (
              <div key={c} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #f1f5f9", padding: "0 12px" }}>
                <div style={{ flex: 1, fontSize: 12, color: "#334155", fontWeight: 600, paddingRight: 8 }}>{c}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {ACOES.map((a) => {
                    const ativa = podeAcao(a.key);
                    const on = marcado(g.tabela, c, a.key);
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => toggle(g.tabela, c, a.key)}
                        disabled={!ativa}
                        title={ativa ? `${g.tabela}.${c} — ${a.label}` : "Ação fora do Acesso desta regra"}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          border: "1px solid",
                          borderColor: ativa ? a.color : "#e2e8f0",
                          borderRadius: 6,
                          background: !ativa ? "#f8fafc" : on ? a.bg : "#fff",
                          color: ativa ? a.color : "#cbd5e1",
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: ativa ? "pointer" : "not-allowed",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 1,
                          padding: "4px 6px",
                        }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>{on ? "✓" : "○"}</span>
                        <span style={{ fontSize: 9, lineHeight: 1 }}>{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Seção: Escrita (campos esperados) — só aparece se a regra tem "registrar" */}
      {/* ------------------------------------------------------------------ */}
      {temRegistrar && (
        <div style={{ padding: "16px 14px 24px", borderTop: "2px solid #e2e8f0", background: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#15803d", marginBottom: 12 }}>
            Escrita — campos esperados pelo executor
          </div>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12, marginTop: 0 }}>
            Configure a tabela e os campos que o bot vai preencher ao executar esta regra (INSERT).
            O executor usa <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>escopo_dados.escrita</code> para gerar o INSERT no banco.
          </p>

          {/* Tabela destino + sem_empresa_id */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <label style={labelSty}>Tabela destino</label>
              <select
                value={tabelaEscrita}
                onChange={(e) => {
                  setTabelaEscrita(e.target.value);
                  // Limpar campos ao trocar de tabela para evitar colunas inválidas
                  setCamposEscrita([]);
                }}
                style={{ ...selectSty, minWidth: 160 }}
              >
                <option value="">— selecione —</option>
                {CAMPOS.map((g) => (
                  <option key={g.tabela} value={g.tabela}>{g.tabela}</option>
                ))}
              </select>
            </div>

            {tabelaEscrita && (
              <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={semEmpresaId}
                  onChange={(e) => setSemEmpresaId(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Tabela sem coluna <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>empresa_id</code>
              </label>
            )}
          </div>

          {/* Lista de campos */}
          {tabelaEscrita && (
            <>
              {/* Variante desktop: tabela horizontal */}
              <div className="m-hide" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 10, minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thSty}>Coluna</th>
                    <th style={thSty}>Rótulo (ex.: &ldquo;Motorista&rdquo;)</th>
                    <th style={thSty}>Tipo</th>
                    <th style={{ ...thSty, textAlign: "center" }}>Obrig.</th>
                    <th style={thSty}>Pergunta do bot</th>
                    <th style={{ ...thSty, width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {camposEscrita.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...tdSty, color: "#94a3b8", fontSize: 12, padding: "10px 8px" }}>
                        Nenhum campo ainda. Clique &ldquo;Adicionar campo&rdquo; abaixo.
                      </td>
                    </tr>
                  )}
                  {camposEscrita.map((cf, idx) => (
                    <tr key={idx}>
                      <td style={tdSty}>
                        <select
                          value={cf.campo}
                          onChange={(e) => {
                            const novo = [...camposEscrita];
                            novo[idx] = { ...novo[idx], campo: e.target.value };
                            setCamposEscrita(novo);
                          }}
                          style={{ ...selectSty, minWidth: 140 }}
                        >
                          <option value="">— coluna —</option>
                          {colunasDisponiveis.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td style={tdSty}>
                        <input
                          type="text"
                          value={cf.rotulo ?? ""}
                          placeholder="Rótulo amigável"
                          onChange={(e) => {
                            const novo = [...camposEscrita];
                            novo[idx] = { ...novo[idx], rotulo: e.target.value };
                            setCamposEscrita(novo);
                          }}
                          style={{ ...inputSty, width: 160 }}
                        />
                      </td>
                      <td style={tdSty}>
                        <select
                          value={cf.tipo}
                          onChange={(e) => {
                            const novo = [...camposEscrita];
                            novo[idx] = { ...novo[idx], tipo: e.target.value as TipoCampo };
                            setCamposEscrita(novo);
                          }}
                          style={selectSty}
                        >
                          <option value="texto">texto</option>
                          <option value="numero">numero</option>
                          <option value="data">data</option>
                        </select>
                      </td>
                      <td style={{ ...tdSty, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={cf.obrigatorio ?? false}
                          onChange={(e) => {
                            const novo = [...camposEscrita];
                            novo[idx] = { ...novo[idx], obrigatorio: e.target.checked };
                            setCamposEscrita(novo);
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={tdSty}>
                        <input
                          type="text"
                          value={cf.pergunta ?? ""}
                          placeholder="O que o bot pergunta se faltar?"
                          onChange={(e) => {
                            const novo = [...camposEscrita];
                            novo[idx] = { ...novo[idx], pergunta: e.target.value };
                            setCamposEscrita(novo);
                          }}
                          style={{ ...inputSty, width: 240 }}
                        />
                      </td>
                      <td style={{ ...tdSty, textAlign: "center" }}>
                        <button
                          type="button"
                          title="Remover este campo"
                          onClick={() => setCamposEscrita(camposEscrita.filter((_, i) => i !== idx))}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 15, lineHeight: 1, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Variante mobile: cards empilhados por campo */}
              <div className="m-show-block" style={{ marginBottom: 10 }}>
                {camposEscrita.length === 0 && (
                  <div style={{ color: "#94a3b8", fontSize: 12, padding: "10px 0" }}>
                    Nenhum campo ainda. Toque em &ldquo;+ Adicionar campo&rdquo; abaixo.
                  </div>
                )}
                {camposEscrita.map((cf, idx) => (
                  <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px", marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>Campo {idx + 1}</span>
                      <button
                        type="button"
                        title="Remover este campo"
                        onClick={() => setCamposEscrita(camposEscrita.filter((_, i) => i !== idx))}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 15, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ×
                      </button>
                    </div>
                    <div>
                      <label style={labelSty}>Coluna</label>
                      <select
                        value={cf.campo}
                        onChange={(e) => { const novo = [...camposEscrita]; novo[idx] = { ...novo[idx], campo: e.target.value }; setCamposEscrita(novo); }}
                        style={{ ...selectSty, width: "100%" }}
                      >
                        <option value="">— coluna —</option>
                        {colunasDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelSty}>Rótulo amigável</label>
                      <input type="text" value={cf.rotulo ?? ""} placeholder="ex.: Motorista" onChange={(e) => { const novo = [...camposEscrita]; novo[idx] = { ...novo[idx], rotulo: e.target.value }; setCamposEscrita(novo); }} style={{ ...inputSty, width: "100%" }} />
                    </div>
                    <div>
                      <label style={labelSty}>Tipo</label>
                      <select value={cf.tipo} onChange={(e) => { const novo = [...camposEscrita]; novo[idx] = { ...novo[idx], tipo: e.target.value as TipoCampo }; setCamposEscrita(novo); }} style={{ ...selectSty, width: "100%" }}>
                        <option value="texto">texto</option>
                        <option value="numero">numero</option>
                        <option value="data">data</option>
                      </select>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475569", minHeight: 44, cursor: "pointer" }}>
                      <input type="checkbox" checked={cf.obrigatorio ?? false} onChange={(e) => { const novo = [...camposEscrita]; novo[idx] = { ...novo[idx], obrigatorio: e.target.checked }; setCamposEscrita(novo); }} style={{ cursor: "pointer" }} />
                      Obrigatório
                    </label>
                    <div>
                      <label style={labelSty}>Pergunta do bot</label>
                      <input type="text" value={cf.pergunta ?? ""} placeholder="O que o bot pergunta se faltar?" onChange={(e) => { const novo = [...camposEscrita]; novo[idx] = { ...novo[idx], pergunta: e.target.value }; setCamposEscrita(novo); }} style={{ ...inputSty, width: "100%" }} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCamposEscrita([...camposEscrita, campoVazio()])}
                style={{ fontSize: 13, color: "#15803d", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6, padding: "0 16px", cursor: "pointer", fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}
              >
                + Adicionar campo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

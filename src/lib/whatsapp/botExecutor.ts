/**
 * Executor SEGURO do bot — gera as queries Supabase DETERMINISTICAMENTE a partir
 * da allowlist de colunas da regra (escopo_dados.colunas). A IA NÃO monta SQL —
 * ela só extrai valores (qual veículo, qual km). Aqui o sistema:
 *   - valida tabela/coluna contra a allowlist + regex de identificador,
 *   - FORÇA filtro por empresa_id (multi-tenant — lição L7),
 *   - limita linhas,
 *   - na escrita: valida (km nunca decresce) + optimistic lock (updated_at).
 *
 * Fontes da pesquisa: allowlist por coluna (Crunchy/Supabase), service-role bypassa
 * RLS → a barreira é o app; optimistic locking; km monotônico (propose→confirm).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const LIMITE = 20;

export type EscopoColunas = Record<string, Record<string, string[]>>; // { tabela: { coluna: acao[] } }

function assertIdent(name: string) {
  if (!IDENT.test(name)) throw new Error(`identificador inválido: ${name}`);
}

/** Colunas que a regra permite para uma ação numa tabela. */
export function colunasPermitidas(escopo: EscopoColunas, tabela: string, acao: string): string[] {
  const t = escopo?.[tabela];
  if (!t) return [];
  return Object.keys(t).filter((c) => (t[c] ?? []).includes(acao) && IDENT.test(c));
}

/** Primeira tabela do escopo que tem alguma coluna com a ação dada. */
export function tabelaDaAcao(escopo: EscopoColunas, acao: string): string | null {
  for (const tabela of Object.keys(escopo ?? {})) {
    if (colunasPermitidas(escopo, tabela, acao).length > 0) return tabela;
  }
  return null;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type VeiculoLite = { id: string; apelido: string | null; placa: string | null; km_atual: number | null; updated_at: string | null };

/** Acha o veículo da empresa pelo apelido OU placa (normalizado). veiculos usa `ativo`, NÃO `status`. */
export async function acharVeiculo(
  sb: SupabaseClient, empresaId: string, alvo: string
): Promise<{ tipo: "ok"; veiculo: VeiculoLite } | { tipo: "nenhum" } | { tipo: "varios"; veiculos: VeiculoLite[] }> {
  const { data, error } = await sb.from("veiculos")
    .select("id,apelido,placa,km_atual,updated_at")
    .eq("empresa_id", empresaId).eq("ativo", true);
  if (error) throw new Error(error.message || "erro ao buscar veículos");
  const lista = (data ?? []) as VeiculoLite[];
  const a = norm(alvo);
  const exatos = lista.filter((v) => norm(v.apelido ?? "") === a || norm(v.placa ?? "") === a);
  const base = exatos.length ? exatos : lista.filter((v) => norm(v.apelido ?? "").includes(a) || norm(v.placa ?? "").includes(a));
  if (base.length === 0) return { tipo: "nenhum" };
  if (base.length === 1) return { tipo: "ok", veiculo: base[0] };
  return { tipo: "varios", veiculos: base.slice(0, 5) };
}

const rotuloVeiculo = (v: VeiculoLite) => `${v.apelido ?? "?"}${v.placa ? ` (${v.placa})` : ""}`;

/**
 * CONSULTA genérica: SELECT das colunas permitidas, filtrado por empresa
 * (+ opcional alvo em veiculos), formatado pra WhatsApp.
 */
export async function executarConsulta(
  sb: SupabaseClient, escopo: EscopoColunas, ctx: { empresa_id: string }, alvo: string | null
): Promise<string> {
  const tabela = tabelaDaAcao(escopo, "consultar");
  if (!tabela) return "Essa regra não tem colunas de consulta definidas (veja Tabelas e campos).";
  assertIdent(tabela);
  const cols = colunasPermitidas(escopo, tabela, "consultar");
  if (cols.length === 0) return "Nenhuma coluna liberada pra consulta nessa regra.";

  // veiculos com alvo: resolve o veículo e busca exatamente as colunas liberadas
  if (tabela === "veiculos" && alvo) {
    const r = await acharVeiculo(sb, ctx.empresa_id, alvo);
    if (r.tipo === "nenhum") return `Não achei o caminhão "${alvo}".`;
    if (r.tipo === "varios") return `Tem mais de um parecido com "${alvo}": ${r.veiculos.map(rotuloVeiculo).join(", ")}. Qual?`;
    const selCols = Array.from(new Set([...cols, "apelido", "placa"])).filter((c) => IDENT.test(c));
    const { data, error } = await sb.from("veiculos")
      .select(selCols.join(",")).eq("id", r.veiculo.id).eq("empresa_id", ctx.empresa_id).maybeSingle();
    if (error) throw new Error(error.message || "erro ao ler o veículo");
    const row = (data ?? {}) as unknown as Record<string, unknown>;
    const linha = cols.map((c) => `${c}: ${row[c] ?? "—"}`).join(" · ");
    return `🚚 ${row.apelido ?? r.veiculo.apelido} ${row.placa ? `(${row.placa})` : ""}\n${linha}`;
  }

  const selectCols = Array.from(new Set([...cols, "id"])).filter((c) => IDENT.test(c));
  const { data, error } = await sb.from(tabela)
    .select(selectCols.join(",")).eq("empresa_id", ctx.empresa_id).limit(LIMITE);
  if (error) throw new Error(error.message || `erro ao consultar ${tabela}`);
  const linhas = (data ?? []) as unknown as Record<string, unknown>[];
  if (linhas.length === 0) return `Nada encontrado em ${tabela}.`;
  const corpo = linhas.slice(0, 10)
    .map((row, i) => `${i + 1}. ${cols.map((c) => `${c}: ${row[c] ?? "—"}`).join(" · ")}`)
    .join("\n");
  const extra = linhas.length > 10 ? `\n… e mais ${linhas.length - 10}.` : "";
  return `📋 ${tabela} (${linhas.length}):\n${corpo}${extra}`;
}

/**
 * Confirma e grava o novo KM — REVALIDA no commit + optimistic lock.
 * km nunca pode decrescer. Se o registro mudou desde a proposta → conflito.
 */
export async function commitAtualizarKm(
  sb: SupabaseClient, ctx: { empresa_id: string }, veiculoId: string, kmNovo: number, updatedAtEsperado: string | null
): Promise<{ ok: true; km: number } | { ok: false; motivo: string }> {
  const { data: atual, error } = await sb.from("veiculos")
    .select("km_atual,updated_at,apelido").eq("id", veiculoId).eq("empresa_id", ctx.empresa_id).maybeSingle();
  if (error) return { ok: false, motivo: "Erro ao reler o veículo." };
  if (!atual) return { ok: false, motivo: "Veículo não encontrado." };
  const kmAtual = Number(atual.km_atual ?? 0);
  if (!Number.isFinite(kmNovo)) return { ok: false, motivo: "KM inválido." };
  if (kmNovo < kmAtual) return { ok: false, motivo: `O KM informado (${kmNovo}) é menor que o atual (${kmAtual}). KM não pode diminuir.` };

  let q = sb.from("veiculos").update({ km_atual: kmNovo, updated_at: new Date().toISOString() })
    .eq("id", veiculoId).eq("empresa_id", ctx.empresa_id);
  if (updatedAtEsperado) q = q.eq("updated_at", updatedAtEsperado);
  const { data: upd, error: e2 } = await q.select("id");
  if (e2) return { ok: false, motivo: "Erro ao gravar." };
  if (!upd || upd.length === 0) return { ok: false, motivo: "O veículo mudou enquanto eu confirmava. Tenta de novo." };
  return { ok: true, km: kmNovo };
}

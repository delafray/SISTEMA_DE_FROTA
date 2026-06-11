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
// Tabelas de EVENTOS que têm FK veiculo_id — consulta sobre um caminhão específico FILTRA por ela.
const TABELAS_COM_VEICULO = new Set(["alocacoes", "abastecimentos", "manutencoes", "avarias", "pedidos"]);

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
  sb: SupabaseClient, escopo: EscopoColunas, ctx: { empresa_id: string }, alvo: string | null, veiculoId?: string | null
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
  let q = sb.from(tabela).select(selectCols.join(",")).eq("empresa_id", ctx.empresa_id);
  // FURO #1: se há um caminhão (nomeado ou do contexto) e a tabela é de eventos, FILTRA por ele.
  // Sem isso, "o status DESSE" devolvia eventos de TODOS os caminhões da empresa.
  if (veiculoId && TABELAS_COM_VEICULO.has(tabela)) q = q.eq("veiculo_id", veiculoId);
  const { data, error } = await q.limit(LIMITE);
  if (error) throw new Error(error.message || `erro ao consultar ${tabela}`);
  const linhas = (data ?? []) as unknown as Record<string, unknown>[];
  if (linhas.length === 0) return `Nada encontrado em ${tabela}.`;
  const corpo = linhas.slice(0, 10)
    .map((row, i) => `${i + 1}. ${cols.map((c) => `${c}: ${row[c] ?? "—"}`).join(" · ")}`)
    .join("\n");
  const extra = linhas.length > 10 ? `\n… e mais ${linhas.length - 10}.` : "";
  return `📋 ${tabela} (${linhas.length}):\n${corpo}${extra}`;
}

// ─── ESCRITOR GENÉRICO (v1: REGISTRAR/INSERT) ───────────────────────────
// A regra declara em escopo_dados.escrita o alvo e os campos esperados; a IA
// só EXTRAI valores (classificador.extrairCampos). Aqui o sistema valida tudo
// contra a allowlist e monta o INSERT deterministicamente.

export type CampoEscrita = {
  campo: string; rotulo?: string; tipo: "texto" | "numero" | "data";
  obrigatorio?: boolean; pergunta?: string;
};
export type EscritaConfig = {
  tabela: string; acao: "registrar"; sem_empresa_id?: boolean;
  fixos?: Record<string, string | number | boolean>;
  campos: CampoEscrita[];
};

/** Lê e valida escopo_dados.escrita (shape + identificadores). null = não tem/inválida. */
export function escritaDaRegra(escopoDados: unknown): EscritaConfig | null {
  const e = (escopoDados as { escrita?: unknown })?.escrita as EscritaConfig | undefined;
  if (!e || typeof e !== "object" || e.acao !== "registrar") return null;
  if (typeof e.tabela !== "string" || !IDENT.test(e.tabela)) return null;
  if (!Array.isArray(e.campos) || e.campos.length === 0) return null;
  for (const c of e.campos) {
    if (typeof c?.campo !== "string" || !IDENT.test(c.campo)) return null;
    if (!["texto", "numero", "data"].includes(c.tipo)) return null;
  }
  for (const k of Object.keys(e.fixos ?? {})) if (!IDENT.test(k)) return null;
  return e;
}

/**
 * Confirma a escrita genérica: REVALIDA a allowlist (a regra pode ter mudado
 * entre a proposta e o "sim"), exige obrigatórios e monta o INSERT só com
 * colunas permitidas (ação "registrar" na matriz) + empresa_id.
 */
export async function commitEscritaGenerica(
  sb: SupabaseClient, ctx: { empresa_id: string },
  escrita: EscritaConfig, escopo: EscopoColunas,
  valores: Record<string, string | number | null>
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const permitidas = colunasPermitidas(escopo, escrita.tabela, "registrar");
  const linha: Record<string, unknown> = {};
  for (const c of escrita.campos) {
    const v = valores[c.campo] ?? null;
    if (c.obrigatorio && v == null) return { ok: false, motivo: `Faltou ${c.rotulo ?? c.campo}.` };
    if (v == null) continue;
    if (!permitidas.includes(c.campo)) return { ok: false, motivo: `O campo ${c.campo} não está liberado na matriz da regra (ação Inclui).` };
    if (c.tipo === "numero" && !(typeof v === "number" && Number.isFinite(v))) return { ok: false, motivo: `${c.rotulo ?? c.campo} precisa ser um número.` };
    if (c.tipo === "data" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { ok: false, motivo: `${c.rotulo ?? c.campo} precisa ser uma data.` };
    linha[c.campo] = v;
  }
  if (Object.keys(linha).length === 0) return { ok: false, motivo: "Nenhum campo pra gravar." };
  for (const [k, v] of Object.entries(escrita.fixos ?? {})) linha[k] = v;
  if (!escrita.sem_empresa_id) linha.empresa_id = ctx.empresa_id;

  const { error } = await sb.from(escrita.tabela).insert(linha);
  if (error) return { ok: false, motivo: "Erro ao gravar. Confere a matriz da regra (campo bloqueado/tabela)." };
  return { ok: true };
}

/** Preview da escrita pro propose→confirm ("• Motorista: Zé"). */
export function previewEscrita(escrita: EscritaConfig, valores: Record<string, string | number | null>): string {
  return escrita.campos
    .filter((c) => valores[c.campo] != null)
    .map((c) => `• ${c.rotulo ?? c.campo}: ${c.tipo === "data" ? String(valores[c.campo]).split("-").reverse().join("/") : valores[c.campo]}`)
    .join("\n");
}

// ─── CONSULTA COM SOMA/PERÍODO (escopo_dados.consulta_soma) ─────────────
// {coluna, periodo: "hoje"|"semana"|"mes", coluna_data?: string} → SUM no período.
export type ConsultaSoma = { coluna: string; periodo?: "hoje" | "semana" | "mes"; coluna_data?: string };

export async function consultaSoma(
  sb: SupabaseClient, escopo: EscopoColunas, ctx: { empresa_id: string },
  cfg: ConsultaSoma, veiculoId?: string | null
): Promise<string> {
  const tabela = tabelaDaAcao(escopo, "consultar");
  if (!tabela) return "Essa regra não tem colunas de consulta definidas (veja Tabelas e campos).";
  assertIdent(tabela); assertIdent(cfg.coluna);
  const colData = cfg.coluna_data ?? "created_at";
  assertIdent(colData);

  const agoraBR = Date.now() - 3 * 3600_000;
  const hojeYmd = new Date(agoraBR).toISOString().slice(0, 10);
  let inicio = new Date(`${hojeYmd}T00:00:00.000Z`).getTime() + 3 * 3600_000;
  if (cfg.periodo === "semana") inicio -= 6 * 86_400_000;
  if (cfg.periodo === "mes") inicio = new Date(`${hojeYmd.slice(0, 8)}01T03:00:00.000Z`).getTime();

  let q = sb.from(tabela).select(cfg.coluna).eq("empresa_id", ctx.empresa_id)
    .gte(colData, new Date(inicio).toISOString());
  if (veiculoId && TABELAS_COM_VEICULO.has(tabela)) q = q.eq("veiculo_id", veiculoId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const total = rows.reduce((s, r) => s + Number(r[cfg.coluna] ?? 0), 0);
  const rotuloPeriodo = cfg.periodo === "mes" ? "no mês" : cfg.periodo === "semana" ? "na semana" : "hoje";
  return `💰 Total ${rotuloPeriodo}: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${rows.length} lançamento${rows.length === 1 ? "" : "s"})`;
}

// ─── STATUS DA FROTA (consulta) ─────────────────────────────────────────
// alocacoes NÃO tem empresa_id → filtra pelos veículos da empresa.
// Alocação ABERTA = fim IS NULL (mesmo critério do painel/VinculoResponsavel).

const STATUS_ICONE: Record<string, string> = { operacional: "🟢", manutencao: "🔧", parado: "🅿️" };
const STATUS_NOME: Record<string, string> = { operacional: "rodando", manutencao: "em manutenção", parado: "parado" };

/**
 * Responde "quais caminhões estão parados / quem está com o leão":
 * frota inteira (ou 1 veículo) com status da alocação aberta + nome do motorista.
 */
export async function consultarStatusFrota(
  sb: SupabaseClient, ctx: { empresa_id: string }, veiculoId?: string | null
): Promise<string> {
  let qv = sb.from("veiculos").select("id,apelido,placa").eq("empresa_id", ctx.empresa_id).eq("ativo", true);
  if (veiculoId) qv = qv.eq("id", veiculoId);
  const { data: veics, error: e1 } = await qv;
  if (e1) throw new Error(e1.message || "erro ao buscar veículos");
  if (!veics?.length) return "Nenhum caminhão ativo encontrado.";

  const ids = veics.map((v) => v.id);
  const { data: alocs, error: e2 } = await sb.from("alocacoes")
    .select("veiculo_id,status,motorista_id").in("veiculo_id", ids).is("fim", null);
  if (e2) throw new Error(e2.message || "erro ao buscar alocações");

  const motIds = [...new Set((alocs ?? []).map((a) => a.motorista_id).filter(Boolean))] as string[];
  const nomes: Record<string, string> = {};
  if (motIds.length) {
    const { data: mots } = await sb.from("motoristas").select("id,nome").in("id", motIds);
    for (const m of mots ?? []) nomes[m.id] = m.nome;
  }

  const alocPorVeiculo = new Map((alocs ?? []).map((a) => [a.veiculo_id, a]));
  const linhas = veics.map((v) => {
    const a = alocPorVeiculo.get(v.id);
    const rot = `${v.apelido ?? "?"}${v.placa ? ` (${v.placa})` : ""}`;
    if (!a) return `⚪ ${rot} — sem vínculo`;
    const quem = a.status === "operacional" && a.motorista_id ? ` — com ${nomes[a.motorista_id] ?? "(motorista)"}` : "";
    return `${STATUS_ICONE[a.status] ?? "•"} ${rot} — ${STATUS_NOME[a.status] ?? a.status}${quem}`;
  });
  return veiculoId ? linhas[0] : `🚛 Frota (${linhas.length}):\n${linhas.join("\n")}`;
}

// ─── MUDAR STATUS DO VEÍCULO (propose→confirm) ──────────────────────────

export type AlocacaoAberta = { id: string; status: string; motorista_id: string | null } | null;

/** Lê a alocação aberta do veículo (pra mostrar no preview e travar no commit). */
export async function lerAlocacaoAberta(sb: SupabaseClient, veiculoId: string): Promise<AlocacaoAberta> {
  const { data, error } = await sb.from("alocacoes")
    .select("id,status,motorista_id").eq("veiculo_id", veiculoId).is("fim", null).maybeSingle();
  if (error) throw new Error(error.message || "erro ao ler alocação");
  return (data as AlocacaoAberta) ?? null;
}

/**
 * Confirma a mudança de status — REVALIDA a alocação aberta no commit (lock por id):
 * se mudou desde a proposta → conflito. Fecha a atual (fim + km_fim) e abre a nova
 * (motorista_id null, km_evento = km_atual do veículo) — IGUAL ao painel.
 */
export async function commitMudarStatus(
  sb: SupabaseClient, ctx: { empresa_id: string }, veiculoId: string,
  statusNovo: "manutencao" | "parado", alocIdEsperado: string | null
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { data: v } = await sb.from("veiculos")
    .select("id,km_atual").eq("id", veiculoId).eq("empresa_id", ctx.empresa_id).maybeSingle();
  if (!v) return { ok: false, motivo: "Veículo não encontrado." };

  const atual = await lerAlocacaoAberta(sb, veiculoId).catch(() => null);
  if ((atual?.id ?? null) !== alocIdEsperado) return { ok: false, motivo: "A situação do caminhão mudou enquanto eu confirmava. Manda de novo." };
  if (atual?.status === statusNovo) return { ok: false, motivo: "O caminhão já está nesse status." };

  const agora = new Date().toISOString();
  const km = v.km_atual ?? null;
  if (atual) {
    const { error } = await sb.from("alocacoes").update({ fim: agora, km_fim: km }).eq("id", atual.id).is("fim", null);
    if (error) return { ok: false, motivo: "Erro ao fechar o vínculo atual." };
  }
  const { error: e2 } = await sb.from("alocacoes")
    .insert({ veiculo_id: veiculoId, motorista_id: null, status: statusNovo, km_evento: km, inicio: agora });
  if (e2) return { ok: false, motivo: "Erro ao gravar o novo status." };
  return { ok: true };
}

/**
 * Confirma e grava o novo KM — REVALIDA no commit + optimistic lock.
 * km nunca pode decrescer. Se o registro mudou desde a proposta → conflito.
 */
export async function commitAtualizarKm(
  sb: SupabaseClient, ctx: { empresa_id: string }, veiculoId: string, kmNovo: number, kmAtualEsperado: number | null
): Promise<{ ok: true; km: number } | { ok: false; motivo: string }> {
  if (!Number.isFinite(kmNovo)) return { ok: false, motivo: "KM inválido." };
  // R2: sem referência de lock (km lido na proposta) não dá pra garantir — recusa.
  if (kmAtualEsperado == null || !Number.isFinite(kmAtualEsperado)) return { ok: false, motivo: "Perdi a referência da proposta. Manda de novo." };

  const { data: atual, error } = await sb.from("veiculos")
    .select("km_atual,apelido").eq("id", veiculoId).eq("empresa_id", ctx.empresa_id).maybeSingle();
  if (error) return { ok: false, motivo: "Erro ao reler o veículo." };
  if (!atual) return { ok: false, motivo: "Veículo não encontrado." };
  const kmAtual = Number(atual.km_atual ?? 0);
  if (kmNovo <= kmAtual) return { ok: false, motivo: `O KM informado (${kmNovo}) não é maior que o atual (${kmAtual}). KM só aumenta.` };

  // R1: lock por VALOR de negócio — só grava se o km ainda for o que vimos na proposta.
  // (updated_at agora é mantido por trigger no banco; não dependemos dele aqui.)
  const { data: upd, error: e2 } = await sb.from("veiculos")
    .update({ km_atual: kmNovo })
    .eq("id", veiculoId).eq("empresa_id", ctx.empresa_id).eq("km_atual", kmAtualEsperado)
    .select("id");
  if (e2) return { ok: false, motivo: "Erro ao gravar." };
  if (!upd || upd.length === 0) return { ok: false, motivo: "O KM do veículo mudou enquanto eu confirmava. Tenta de novo." };
  return { ok: true, km: kmNovo };
}

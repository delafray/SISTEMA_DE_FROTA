/**
 * LEITORES DEDICADOS do bot — consultas do GESTOR LEIGO no zap.
 * Cada leitor cruza tabelas DETERMINISTICAMENTE (a IA não monta query) e devolve
 * resposta mastigada em pt-BR (sem nome de tabela). Ligado pela regra via
 * `escopo_dados.consulta_dedicada` (ver classificadorBot). Spec: docs/PLANO_ZAP_GESTOR.md.
 *
 * Convenções do banco (recon 11/06): alocação aberta = fim IS NULL (status
 * operacional|parado|manutencao; SEM empresa_id → filtra pelos veículos);
 * rota: rotas_otimizadas.status rascunho|otimizada|em_andamento|concluida|cancelada,
 * 1 rota = 1 motorista + data YYYY-MM-DD; parada concluída = concluida_em != null;
 * entrega concluída = data_fim != null; lembrete pendente = ciente_em IS NULL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const LIMITE_LISTA = 8;
// Brasil sem horário de verão desde 2019 → offset fixo -3h.
const OFFSET_BR_MS = 3 * 60 * 60 * 1000;

export type CtxLeitor = { empresa_id: string };
export type OptsLeitor = { veiculoId?: string | null };
export type Leitor = (sb: SupabaseClient, ctx: CtxLeitor, opts: OptsLeitor) => Promise<string>;

// ─── helpers de data (fuso do Brasil) ──────────────────────────────────
function hojeLocal(): { ymd: string; inicioISO: string; fimISO: string } {
  const agoraLocal = new Date(Date.now() - OFFSET_BR_MS);
  const ymd = agoraLocal.toISOString().slice(0, 10);
  const inicio = new Date(`${ymd}T00:00:00.000Z`).getTime() + OFFSET_BR_MS;
  return { ymd, inicioISO: new Date(inicio).toISOString(), fimISO: new Date(inicio + 86_400_000).toISOString() };
}
function horaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - OFFSET_BR_MS).toISOString().slice(11, 16);
}
function diaHoraLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - OFFSET_BR_MS).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`;
}
function dataBr(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

// ─── helpers de frota ───────────────────────────────────────────────────
type VeicLite = { id: string; apelido: string | null; placa: string | null };
const rotulo = (v: VeicLite | undefined) => (v ? `${v.apelido ?? "?"}${v.placa ? ` (${v.placa})` : ""}` : "?");

async function veiculosDaEmpresa(sb: SupabaseClient, empresaId: string, veiculoId?: string | null): Promise<VeicLite[]> {
  let q = sb.from("veiculos").select("id,apelido,placa").eq("empresa_id", empresaId).eq("ativo", true);
  if (veiculoId) q = q.eq("id", veiculoId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as VeicLite[];
}

type Aloc = { veiculo_id: string; status: string; motorista_id: string | null };
async function alocacoesAbertas(sb: SupabaseClient, veiculoIds: string[]): Promise<Aloc[]> {
  if (!veiculoIds.length) return [];
  const { data, error } = await sb.from("alocacoes")
    .select("veiculo_id,status,motorista_id").in("veiculo_id", veiculoIds).is("fim", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as Aloc[];
}

async function nomesMotoristas(sb: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await sb.from("motoristas").select("id,nome").in("id", unicos);
  const r: Record<string, string> = {};
  for (const m of data ?? []) r[m.id] = m.nome;
  return r;
}

async function nomesClientes(sb: SupabaseClient, ids: (string | null)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[];
  if (!unicos.length) return {};
  const { data } = await sb.from("clientes").select("id,nome_fantasia").in("id", unicos);
  const r: Record<string, string> = {};
  for (const c of data ?? []) r[c.id] = c.nome_fantasia;
  return r;
}

// ─── R1: ANDAMENTO DAS ROTAS ("o leão já saiu?") ───────────────────────
export async function andamentoRotas(sb: SupabaseClient, ctx: CtxLeitor, opts: OptsLeitor): Promise<string> {
  const hoje = hojeLocal();
  const veics = await veiculosDaEmpresa(sb, ctx.empresa_id, null);
  const alocs = await alocacoesAbertas(sb, veics.map((v) => v.id));
  const veiculoDoMotorista = new Map<string, VeicLite>();
  for (const a of alocs) {
    if (a.status === "operacional" && a.motorista_id) {
      const v = veics.find((x) => x.id === a.veiculo_id);
      if (v) veiculoDoMotorista.set(a.motorista_id, v);
    }
  }

  let q = sb.from("rotas_otimizadas")
    .select("id,motorista_id,status,criada_em").eq("empresa_id", ctx.empresa_id).eq("data", hoje.ymd);
  if (opts.veiculoId) {
    const motDoVeiculo = alocs.find((a) => a.veiculo_id === opts.veiculoId && a.status === "operacional")?.motorista_id;
    if (!motDoVeiculo) {
      const v = veics.find((x) => x.id === opts.veiculoId);
      return `${rotulo(v)} está sem motorista vinculado — não tem rota pra acompanhar.`;
    }
    q = q.eq("motorista_id", motDoVeiculo);
  }
  const { data: rotas, error } = await q;
  if (error) throw new Error(error.message);
  if (!rotas?.length) {
    return opts.veiculoId
      ? "Esse caminhão não tem rota criada hoje."
      : `Nenhuma rota criada hoje (${dataBr(hoje.ymd)}).`;
  }

  const { data: paradas } = await sb.from("paradas")
    .select("rota_id,concluida_em").in("rota_id", rotas.map((r) => r.id));
  const nomes = await nomesMotoristas(sb, rotas.map((r) => r.motorista_id));

  const linhas = rotas.map((r) => {
    const ps = (paradas ?? []).filter((p) => p.rota_id === r.id);
    const feitas = ps.filter((p) => p.concluida_em).length;
    const ultima = ps.map((p) => p.concluida_em).filter(Boolean).sort().pop() as string | undefined;
    const v = r.motorista_id ? veiculoDoMotorista.get(r.motorista_id) : undefined;
    const quem = `${rotulo(v)} — ${r.motorista_id ? (nomes[r.motorista_id] ?? "(motorista)") : "(sem motorista)"}`;
    if (r.status === "em_andamento") {
      const prog = feitas === 0
        ? "EM ROTA, ainda sem entrega feita"
        : `EM ROTA — ${feitas} de ${ps.length} entregas · última ${horaLocal(ultima!)}`;
      return `🚚 ${quem}: ${prog}`;
    }
    if (r.status === "concluida") return `✅ ${quem}: rota CONCLUÍDA (${ps.length} entregas)`;
    if (r.status === "cancelada") return `❌ ${quem}: rota cancelada`;
    return `🅿️ ${quem}: rota pronta, AINDA NÃO SAIU`;
  });
  return `🗺️ Rotas de hoje (${dataBr(hoje.ymd)}):\n${linhas.join("\n")}`;
}

// ─── R2: ENTREGAS DO DIA ("entregou tudo?") ────────────────────────────
export async function entregasDia(sb: SupabaseClient, ctx: CtxLeitor, _opts: OptsLeitor): Promise<string> {
  const hoje = hojeLocal();
  const [{ data: feitas }, { data: pendentes }] = await Promise.all([
    sb.from("entregas").select("id").eq("empresa_id", ctx.empresa_id)
      .gte("data_fim", hoje.inicioISO).lt("data_fim", hoje.fimISO),
    sb.from("entregas").select("id,cliente_id,nome_cliente_avulso,destino,status").eq("empresa_id", ctx.empresa_id)
      .in("status", ["agendada", "agendado", "em_andamento"]).limit(50),
  ]);
  const nFeitas = feitas?.length ?? 0;
  const pend = pendentes ?? [];
  if (nFeitas === 0 && pend.length === 0) return "Sem entregas hoje — nada feito e nada pendente.";
  const clientes = await nomesClientes(sb, pend.map((p) => p.cliente_id));
  const lista = pend.slice(0, LIMITE_LISTA)
    .map((p) => `• ${p.cliente_id ? (clientes[p.cliente_id] ?? "cliente") : (p.nome_cliente_avulso ?? p.destino ?? "—")}`)
    .join("\n");
  const extra = pend.length > LIMITE_LISTA ? `\n…e mais ${pend.length - LIMITE_LISTA}.` : "";
  return pend.length === 0
    ? `📦 Hoje: ${nFeitas} entregas feitas · ✅ nada pendente!`
    : `📦 Hoje: ${nFeitas} feitas · ${pend.length} pendentes:\n${lista}${extra}`;
}

// ─── R3: PEDIDOS EM ABERTO ("tem pedido parado?") ──────────────────────
export async function pedidosAbertos(sb: SupabaseClient, ctx: CtxLeitor, _opts: OptsLeitor): Promise<string> {
  const [{ data: abertos }, { data: andamento }] = await Promise.all([
    sb.from("pedidos").select("numero,cliente_id,created_at").eq("empresa_id", ctx.empresa_id)
      .in("status", ["agendada", "agendado"]).order("created_at", { ascending: true }).limit(20),
    sb.from("pedidos").select("id").eq("empresa_id", ctx.empresa_id).eq("status", "em_andamento"),
  ]);
  const lista = abertos ?? [];
  const emRota = andamento?.length ?? 0;
  if (!lista.length) {
    return emRota > 0
      ? `✅ Nenhum pedido parado. ${emRota} em andamento na rua.`
      : "✅ Nenhum pedido em aberto.";
  }
  const clientes = await nomesClientes(sb, lista.map((p) => p.cliente_id));
  const linhas = lista.slice(0, LIMITE_LISTA)
    .map((p) => `• #${p.numero} — ${p.cliente_id ? (clientes[p.cliente_id] ?? "cliente") : "avulso"}`)
    .join("\n");
  const extra = lista.length > LIMITE_LISTA ? `\n…e mais ${lista.length - LIMITE_LISTA}.` : "";
  return `📋 ${lista.length} pedido(s) pra despachar:\n${linhas}${extra}${emRota ? `\n🚚 ${emRota} em andamento na rua.` : ""}`;
}

// ─── R4: RESUMO DO DIA ("como foi o dia?") ─────────────────────────────
export async function resumoDia(sb: SupabaseClient, ctx: CtxLeitor, _opts: OptsLeitor): Promise<string> {
  const hoje = hojeLocal();
  const veics = await veiculosDaEmpresa(sb, ctx.empresa_id, null);
  const [alocs, entregasFeitas, entregasPend, pedidosNovos, pedidosRua, avarias, abasts] = await Promise.all([
    alocacoesAbertas(sb, veics.map((v) => v.id)),
    sb.from("entregas").select("id").eq("empresa_id", ctx.empresa_id).gte("data_fim", hoje.inicioISO).lt("data_fim", hoje.fimISO),
    sb.from("entregas").select("id").eq("empresa_id", ctx.empresa_id).in("status", ["agendada", "agendado", "em_andamento"]),
    sb.from("pedidos").select("id").eq("empresa_id", ctx.empresa_id).gte("created_at", hoje.inicioISO),
    sb.from("pedidos").select("id").eq("empresa_id", ctx.empresa_id).eq("status", "em_andamento"),
    sb.from("avarias").select("id,urgencia").eq("empresa_id", ctx.empresa_id).in("status", ["aberta", "em_reparo"]),
    sb.from("abastecimentos").select("valor_total").eq("empresa_id", ctx.empresa_id).gte("created_at", hoje.inicioISO),
  ]);
  const porStatus = (s: string) => alocs.filter((a) => a.status === s).length;
  const rodando = porStatus("operacional"), manut = porStatus("manutencao"), parados = porStatus("parado");
  const semVinculo = veics.length - alocs.length;
  const nAvarias = avarias.data?.length ?? 0;
  const urgente = (avarias.data ?? []).some((a) => a.urgencia === "alta" || a.urgencia === "critica");
  const diesel = (abasts.data ?? []).reduce((s, a) => s + Number(a.valor_total ?? 0), 0);

  const linhas = [
    `📊 Resumo de hoje (${dataBr(hoje.ymd)}):`,
    `🚛 Frota: ${rodando} rodando · ${manut} manutenção · ${parados} parados${semVinculo > 0 ? ` · ${semVinculo} sem vínculo` : ""}`,
    `📦 Entregas: ${entregasFeitas.data?.length ?? 0} feitas · ${entregasPend.data?.length ?? 0} pendentes`,
    `📋 Pedidos: ${pedidosNovos.data?.length ?? 0} novos hoje · ${pedidosRua.data?.length ?? 0} em andamento`,
    nAvarias > 0 ? `🔧 ${nAvarias} avaria(s) aberta(s)${urgente ? " — TEM URGENTE ⚠️" : ""}` : "🔧 Nenhuma avaria aberta",
    diesel > 0 ? `⛽ Diesel hoje: R$ ${diesel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${abasts.data!.length}x)` : "⛽ Sem abastecimento hoje",
  ];
  return linhas.join("\n");
}

// ─── R5: VENCIMENTOS (documentos e revisões, 30 dias) ──────────────────
export async function vencimentos(sb: SupabaseClient, ctx: CtxLeitor, _opts: OptsLeitor): Promise<string> {
  const hoje = hojeLocal();
  const limite = new Date(new Date(hoje.inicioISO).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: veics }, { data: mots }] = await Promise.all([
    sb.from("veiculos")
      .select("apelido,placa,km_atual,ipva_vencimento,licenciamento_vencimento,seguro_vencimento,data_proxima_revisao,km_proxima_revisao")
      .eq("empresa_id", ctx.empresa_id).eq("ativo", true),
    sb.from("motoristas").select("nome,cnh_validade").eq("empresa_id", ctx.empresa_id).eq("ativo", true),
  ]);

  const itens: string[] = [];
  const checaData = (rot: string, nome: string, ymd: string | null) => {
    if (!ymd || ymd > limite) return;
    itens.push(ymd < hoje.ymd ? `🔴 ${nome} do ${rot}: VENCIDO (${dataBr(ymd)})` : `⚠️ ${nome} do ${rot}: vence ${dataBr(ymd)}`);
  };
  for (const v of veics ?? []) {
    const rot = `${v.apelido ?? v.placa ?? "?"}`;
    checaData(rot, "IPVA", v.ipva_vencimento);
    checaData(rot, "Licenciamento", v.licenciamento_vencimento);
    checaData(rot, "Seguro", v.seguro_vencimento);
    checaData(rot, "Revisão", v.data_proxima_revisao);
    if (v.km_proxima_revisao != null && v.km_atual != null) {
      const faltam = Number(v.km_proxima_revisao) - Number(v.km_atual);
      if (faltam <= 0) itens.push(`🔴 Revisão do ${rot}: VENCIDA por km (passou ${Math.abs(faltam).toLocaleString("pt-BR")} km)`);
      else if (faltam <= 1000) itens.push(`⚠️ Revisão do ${rot}: faltam ${faltam.toLocaleString("pt-BR")} km`);
    }
  }
  for (const m of mots ?? []) {
    const cnh = m.cnh_validade as string | null;
    if (!cnh || cnh > limite) continue;
    itens.push(cnh < hoje.ymd ? `🔴 CNH do ${m.nome}: VENCIDA (${dataBr(cnh)})` : `⚠️ CNH do ${m.nome}: vence ${dataBr(cnh)}`);
  }
  return itens.length
    ? `📅 Vencimentos (próximos 30 dias):\n${itens.join("\n")}`
    : "✅ Nada vencendo nos próximos 30 dias (documentos, revisões e CNHs ok).";
}

// ─── R6: ONDE ESTÁ ("cadê o leão?") — fase 1: última entrega ───────────
export async function ondeEsta(sb: SupabaseClient, ctx: CtxLeitor, opts: OptsLeitor): Promise<string> {
  if (!opts.veiculoId) return "De qual caminhão? Me diz o apelido ou a placa.";
  const [vRes, ultimaRes, pendRes] = await Promise.all([
    sb.from("veiculos").select("apelido,placa").eq("id", opts.veiculoId).maybeSingle(),
    sb.from("entregas").select("data_fim,destino,nome_cliente_avulso,cliente_id").eq("empresa_id", ctx.empresa_id)
      .eq("veiculo_id", opts.veiculoId).not("data_fim", "is", null)
      .order("data_fim", { ascending: false }).limit(1),
    sb.from("entregas").select("id").eq("empresa_id", ctx.empresa_id)
      .eq("veiculo_id", opts.veiculoId).in("status", ["agendada", "agendado", "em_andamento"]),
  ]);
  const rot = vRes.data ? `${vRes.data.apelido ?? vRes.data.placa ?? "?"}` : "esse caminhão";
  const ult = ultimaRes.data?.[0];
  const pend = pendRes.data?.length ?? 0;
  if (!ult) return `Ainda não tem entrega registrada do ${rot} — sem posição pra estimar. ${pend ? `Tem ${pend} entrega(s) na fila.` : ""}`.trim();
  let onde = ult.destino ?? "destino não informado";
  if (ult.cliente_id) {
    const nomes = await nomesClientes(sb, [ult.cliente_id]);
    onde = nomes[ult.cliente_id] ?? onde;
  } else if (ult.nome_cliente_avulso) onde = ult.nome_cliente_avulso;
  return `📍 ${rot}: última entrega ${diaHoraLocal(ult.data_fim!)} — ${onde}.` +
    (pend ? ` Ainda tem ${pend} entrega(s) pela frente.` : " Sem entregas pendentes.") +
    `\n_(posição aproximada pela última entrega — rastreador em tempo real entra depois)_`;
}

// ─── R7: MEUS LEMBRETES ("o que eu te falei pra anotar?") ──────────────
// Lembretes são SEM TRAVA (decisão do dono): não filtra por empresa.
export async function meusLembretes(sb: SupabaseClient, _ctx: CtxLeitor, _opts: OptsLeitor): Promise<string> {
  const { data, error } = await sb.from("lembretes")
    .select("texto,criado_em,criado_por_nome").is("ciente_em", null)
    .order("criado_em", { ascending: false }).limit(5);
  if (error) throw new Error(error.message);
  if (!data?.length) return "📝 Nenhuma anotação pendente — tudo em dia.";
  const linhas = data.map((l, i) => {
    const txt = (l.texto ?? "").length > 90 ? `${l.texto.slice(0, 90)}…` : l.texto;
    return `${i + 1}. "${txt}" — ${diaHoraLocal(l.criado_em)}${l.criado_por_nome ? ` (${l.criado_por_nome})` : ""}`;
  });
  return `📝 Últimas anotações pendentes:\n${linhas.join("\n")}\n\n_Pra resolver/apagar, é no painel._`;
}

// ─── dispatch: escopo_dados.consulta_dedicada → leitor ─────────────────
export const LEITORES: Record<string, Leitor> = {
  andamento_rotas: andamentoRotas,
  entregas_dia: entregasDia,
  pedidos_abertos: pedidosAbertos,
  resumo_dia: resumoDia,
  vencimentos,
  onde_esta: ondeEsta,
  meus_lembretes: meusLembretes,
};

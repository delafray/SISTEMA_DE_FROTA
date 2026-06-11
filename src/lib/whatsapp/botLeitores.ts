/**
 * Leitores dedicados para o GESTOR LEIGO — respostas mastigadas em pt-BR,
 * sem jargão de banco (nomes de tabela, IDs), emojis, filtradas por empresa_id.
 * Chamados por classificadorBot.ts quando regra tem `escopo_dados.consulta_dedicada`.
 *
 * NOTA: datas usam UTC (servidor). Se o dono estiver em BRT (UTC-3) após 21h, o "hoje"
 * pode divergir. Ajuste com fuso quando necessário.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CtxEmpresa = { empresa_id: string };
export type LeitoresGestorFn = (sb: SupabaseClient, ctx: CtxEmpresa, veiculoId?: string) => Promise<string>;

// ─── helpers ────────────────────────────────────────────────────────────────

function hoje(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hhmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

function ddmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const h = new Date(hoje() + "T00:00:00Z");
  return Math.ceil((d.getTime() - h.getTime()) / 86_400_000);
}

// ─── 1. Andamento das rotas de hoje ─────────────────────────────────────────

export async function andamentoRotas(sb: SupabaseClient, ctx: CtxEmpresa): Promise<string> {
  const hj = hoje();
  const { data: rotas, error } = await sb
    .from("rotas_otimizadas")
    .select("id,status,motorista_id,distancia_total_km,tempo_total_min")
    .eq("empresa_id", ctx.empresa_id)
    .eq("data", hj)
    .limit(20);
  if (error) throw new Error(error.message);
  if (!rotas?.length) return `🗺️ Nenhuma rota programada para hoje (${ddmm(hj)}).`;

  const motIds = [...new Set(rotas.map((r) => r.motorista_id).filter(Boolean))] as string[];
  const nomes: Record<string, string> = {};
  if (motIds.length) {
    const { data: mots } = await sb.from("motoristas").select("id,nome").in("id", motIds);
    for (const m of mots ?? []) nomes[m.id] = m.nome;
  }

  const rotaIds = rotas.map((r) => r.id);
  const { data: paradas } = await sb
    .from("paradas")
    .select("rota_id,concluida_em")
    .in("rota_id", rotaIds);

  type ContRota = { total: number; feitas: number; ultima: string | null };
  const cont = new Map<string, ContRota>();
  for (const p of paradas ?? []) {
    const c = cont.get(p.rota_id) ?? { total: 0, feitas: 0, ultima: null };
    c.total++;
    if (p.concluida_em) {
      c.feitas++;
      if (!c.ultima || p.concluida_em > c.ultima) c.ultima = p.concluida_em;
    }
    cont.set(p.rota_id, c);
  }

  const ICON: Record<string, string> = { pendente: "⏳", em_andamento: "🚛", concluida: "✅", cancelada: "❌" };
  const linhas = rotas.map((r) => {
    const mot = nomes[r.motorista_id] ?? "Motorista";
    const ic = ICON[r.status] ?? "•";
    const c = cont.get(r.id);
    const parada = c ? `${c.feitas}/${c.total} paradas` : "sem paradas";
    const ultima = c?.ultima ? ` · última às ${hhmm(c.ultima)}` : "";
    const km = r.distancia_total_km ? ` · ${Number(r.distancia_total_km).toFixed(0)} km` : "";
    return `${ic} ${mot} — ${parada}${ultima}${km}`;
  });

  return `🗺️ *Rotas de hoje (${ddmm(hj)}):*\n${linhas.join("\n")}`;
}

// ─── 2. Resumo do dia ────────────────────────────────────────────────────────

export async function resumoDia(sb: SupabaseClient, ctx: CtxEmpresa): Promise<string> {
  const hj = hoje();
  const am = amanha();

  // frota: veículos ativos + alocações abertas
  const { data: veics } = await sb.from("veiculos").select("id").eq("empresa_id", ctx.empresa_id).eq("ativo", true);
  const vIds = (veics ?? []).map((v) => v.id);
  const cont = { operacional: 0, parado: 0, manutencao: 0, semVinculo: 0 };
  if (vIds.length) {
    const { data: alocs } = await sb.from("alocacoes").select("veiculo_id,status").in("veiculo_id", vIds).is("fim", null);
    const alocMap = new Map((alocs ?? []).map((a) => [a.veiculo_id, a.status as string]));
    for (const v of veics ?? []) {
      const st = alocMap.get(v.id);
      if (!st) cont.semVinculo++;
      else if (st === "operacional") cont.operacional++;
      else if (st === "manutencao") cont.manutencao++;
      else cont.parado++;
    }
  }

  // entregas criadas hoje
  const { data: ents } = await sb
    .from("entregas")
    .select("status")
    .eq("empresa_id", ctx.empresa_id)
    .gte("created_at", hj)
    .lt("created_at", am);
  const entConcl = (ents ?? []).filter((e) => e.status === "concluida" || e.status === "entregue").length;
  const entTotal = (ents ?? []).length;

  // pedidos criados hoje
  const { count: pedNovos } = await sb
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", ctx.empresa_id)
    .gte("created_at", hj)
    .lt("created_at", am);

  // avarias abertas (status != resolvido)
  const { count: avarAberto } = await sb
    .from("avarias")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", ctx.empresa_id)
    .neq("status", "resolvido");

  // diesel do dia
  const { data: abasts } = await sb
    .from("abastecimentos")
    .select("litros,valor_total")
    .eq("empresa_id", ctx.empresa_id)
    .gte("created_at", hj)
    .lt("created_at", am);
  const litrosDia = (abasts ?? []).reduce((s, a) => s + (Number(a.litros) || 0), 0);
  const valorDiesel = (abasts ?? []).reduce((s, a) => s + (Number(a.valor_total) || 0), 0);

  const total = vIds.length;
  return [
    `📅 *Resumo de hoje (${ddmm(hj)})*`,
    ``,
    `🚛 Frota (${total} ativo${total !== 1 ? "s" : ""}):  🟢 ${cont.operacional} rodando  🔧 ${cont.manutencao} manutenção  🅿️ ${cont.parado} parado  ⚪ ${cont.semVinculo} sem vínculo`,
    `📦 Entregas hoje: ${entConcl} concluídas de ${entTotal} registradas`,
    `📋 Pedidos novos: ${pedNovos ?? 0}`,
    avarAberto ? `⚠️ Avarias abertas: ${avarAberto}` : `✅ Sem avarias abertas`,
    litrosDia > 0
      ? `⛽ Diesel: ${litrosDia.toFixed(0)} L · R$ ${valorDiesel.toFixed(2).replace(".", ",")}`
      : `⛽ Sem abastecimento registrado hoje`,
  ].join("\n");
}

// ─── 3. Entregas do dia ──────────────────────────────────────────────────────

export async function entregasDia(sb: SupabaseClient, ctx: CtxEmpresa): Promise<string> {
  const hj = hoje();
  const am = amanha();
  const { data: entregas } = await sb
    .from("entregas")
    .select("id,status,destino,nome_cliente_avulso,data_entrega_prevista")
    .eq("empresa_id", ctx.empresa_id)
    .or(`data_entrega_prevista.eq.${hj},created_at.gte.${hj}`)
    .lt("updated_at", am + "T23:59:59")
    .limit(60);

  if (!entregas?.length) return `📦 Nenhuma entrega registrada para hoje (${ddmm(hj)}).`;

  const porStatus: Record<string, number> = {};
  const pendentes: string[] = [];
  for (const e of entregas) {
    const s = e.status ?? "sem_status";
    porStatus[s] = (porStatus[s] ?? 0) + 1;
    if (s !== "concluida" && s !== "entregue" && s !== "cancelada") {
      pendentes.push(e.nome_cliente_avulso ?? e.destino ?? "destino não informado");
    }
  }

  const resumo = Object.entries(porStatus).map(([s, n]) => `${n}× ${s}`).join("  ·  ");
  const listaPend = pendentes.slice(0, 8).map((p, i) => `${i + 1}. ${p}`).join("\n");
  const extra = pendentes.length > 8 ? `\n… e mais ${pendentes.length - 8}` : "";

  return [
    `📦 *Entregas de hoje (${ddmm(hj)}):*`,
    resumo,
    pendentes.length
      ? `\n🔸 Pendentes:\n${listaPend}${extra}`
      : `\n✅ Todas concluídas!`,
  ].join("\n");
}

// ─── 4. Pedidos abertos ──────────────────────────────────────────────────────

export async function pedidosAbertos(sb: SupabaseClient, ctx: CtxEmpresa): Promise<string> {
  const { data: pedidos } = await sb
    .from("pedidos")
    .select("id,numero,status,cliente_id,created_at")
    .eq("empresa_id", ctx.empresa_id)
    .neq("status", "concluido")
    .neq("status", "cancelado")
    .neq("status", "faturado")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!pedidos?.length) return "📋 Nenhum pedido em aberto no momento. 🎉";

  const cliIds = [...new Set(pedidos.map((p) => p.cliente_id).filter(Boolean))] as string[];
  const nomeCli: Record<string, string> = {};
  if (cliIds.length) {
    const { data: clientes } = await sb.from("clientes").select("id,nome_fantasia").in("id", cliIds);
    for (const c of clientes ?? []) nomeCli[c.id] = c.nome_fantasia;
  }

  const linhas = pedidos.map((p) => {
    const cli = p.cliente_id ? (nomeCli[p.cliente_id] ?? "(cliente)") : "(avulso)";
    const num = p.numero ? `#${p.numero}` : p.id.slice(0, 8);
    return `• ${num} — ${cli} — *${p.status}*`;
  });
  const suf = pedidos.length >= 20 ? "\n_(20 mais recentes — pode ter mais)_" : "";
  return `📋 *Pedidos em aberto (${pedidos.length}):*\n${linhas.join("\n")}${suf}`;
}

// ─── 5. Vencimentos próximos (30 dias) ──────────────────────────────────────

export async function vencimentos(sb: SupabaseClient, ctx: CtxEmpresa, veiculoId?: string): Promise<string> {
  let qv = sb
    .from("veiculos")
    .select("id,apelido,placa,ipva_vencimento,licenciamento_vencimento,seguro_vencimento,data_proxima_revisao,km_proxima_revisao,km_atual")
    .eq("empresa_id", ctx.empresa_id)
    .eq("ativo", true);
  if (veiculoId) qv = qv.eq("id", veiculoId);
  const { data: veics } = await qv;

  let qm = sb.from("motoristas").select("id,nome,cnh_validade").eq("empresa_id", ctx.empresa_id).eq("ativo", true);
  const { data: mots } = await qm;

  const alertas: string[] = [];

  for (const v of veics ?? []) {
    const rot = `${v.apelido ?? "?"}${v.placa ? ` (${v.placa})` : ""}`;
    const checks: [string | null, string][] = [
      [v.ipva_vencimento, "IPVA"],
      [v.licenciamento_vencimento, "Licenciamento"],
      [v.seguro_vencimento, "Seguro"],
      [v.data_proxima_revisao, "Revisão"],
    ];
    for (const [data, label] of checks) {
      const d = diasAte(data);
      if (d !== null && d <= 30 && d >= -5) {
        const ic = d < 0 ? "⛔ VENCIDO" : d === 0 ? "🔴 HOJE" : d <= 7 ? "🔴" : "🟡";
        alertas.push(`${ic} ${rot} — ${label}: ${ddmm(data)} (${d < 0 ? `${-d}d atrás` : `${d}d`})`);
      }
    }
    if (v.km_proxima_revisao != null && v.km_atual != null) {
      const faltam = Number(v.km_proxima_revisao) - Number(v.km_atual);
      if (faltam <= 3000) {
        const ic = faltam <= 0 ? "⛔" : faltam <= 500 ? "🔴" : "🟡";
        alertas.push(`${ic} ${rot} — Revisão por KM: faltam ${Math.max(0, faltam).toLocaleString("pt-BR")} km`);
      }
    }
  }

  for (const m of mots ?? []) {
    const d = diasAte(m.cnh_validade);
    if (d !== null && d <= 30 && d >= -5) {
      const ic = d < 0 ? "⛔ VENCIDA" : d <= 7 ? "🔴" : "🟡";
      alertas.push(`${ic} CNH ${m.nome} — vence ${ddmm(m.cnh_validade)} (${d < 0 ? `${-d}d atrás` : `${d}d`})`);
    }
  }

  if (!alertas.length) return "✅ Nenhum vencimento nos próximos 30 dias. Tudo em dia!";
  return `🗓️ *Vencimentos próximos:*\n${alertas.join("\n")}`;
}

// ─── 6. Onde está (última posição por entrega concluída) ─────────────────────

export async function ondeEsta(sb: SupabaseClient, ctx: CtxEmpresa, veiculoId?: string): Promise<string> {
  let qv = sb.from("veiculos").select("id,apelido,placa").eq("empresa_id", ctx.empresa_id).eq("ativo", true);
  if (veiculoId) qv = qv.eq("id", veiculoId);
  const { data: veics, error } = await qv;
  if (error) throw new Error(error.message);
  if (!veics?.length) return "🚛 Nenhum caminhão ativo encontrado.";

  const vIds = veics.map((v) => v.id);

  // última entrega concluída por veículo
  const { data: ultimas } = await sb
    .from("entregas")
    .select("veiculo_id,destino,nome_cliente_avulso,data_fim")
    .in("veiculo_id", vIds)
    .or("status.eq.concluida,status.eq.entregue")
    .order("data_fim", { ascending: false })
    .limit(vIds.length * 5);

  const ultimaPorV = new Map<string, { dest: string; data_fim: string | null }>();
  for (const e of ultimas ?? []) {
    if (!ultimaPorV.has(e.veiculo_id)) {
      ultimaPorV.set(e.veiculo_id, {
        dest: e.nome_cliente_avulso ?? e.destino ?? "destino não informado",
        data_fim: e.data_fim,
      });
    }
  }

  // situação atual (alocação aberta)
  const { data: alocs } = await sb
    .from("alocacoes")
    .select("veiculo_id,status,motorista_id")
    .in("veiculo_id", vIds)
    .is("fim", null);
  const alocMap = new Map((alocs ?? []).map((a) => [a.veiculo_id, a]));
  const motIds = [...new Set((alocs ?? []).map((a) => a.motorista_id).filter(Boolean))] as string[];
  const nomeMot: Record<string, string> = {};
  if (motIds.length) {
    const { data: mots } = await sb.from("motoristas").select("id,nome").in("id", motIds);
    for (const m of mots ?? []) nomeMot[m.id] = m.nome;
  }

  const STATUS_NOME: Record<string, string> = { operacional: "em rota", manutencao: "em manutenção", parado: "parado" };

  const linhas = veics.map((v) => {
    const rot = `${v.apelido ?? "?"}${v.placa ? ` (${v.placa})` : ""}`;
    const aloc = alocMap.get(v.id);
    const sit = !aloc
      ? "sem vínculo"
      : aloc.status === "operacional" && aloc.motorista_id
        ? `em rota com ${nomeMot[aloc.motorista_id] ?? "motorista"}`
        : (STATUS_NOME[aloc.status] ?? aloc.status);
    const ult = ultimaPorV.get(v.id);
    if (!ult) return `🚛 *${rot}* — ${sit}\n   📍 Sem entrega registrada ainda`;
    return `🚛 *${rot}* — ${sit}\n   📍 Última entrega às ${hhmm(ult.data_fim)}: ${ult.dest}\n   _(posição aproximada — local da última entrega concluída)_`;
  });

  return linhas.join("\n\n");
}

// ─── 7. Meus lembretes ───────────────────────────────────────────────────────

export async function meusLembretes(sb: SupabaseClient, ctx: CtxEmpresa): Promise<string> {
  const { data: lembs } = await sb
    .from("lembretes")
    .select("id,texto,criado_em,criado_por_nome")
    .eq("empresa_id", ctx.empresa_id)
    .is("ciente_em", null)
    .order("criado_em", { ascending: false })
    .limit(10);

  if (!lembs?.length) return "📝 Nenhum lembrete pendente. ✅";

  const linhas = lembs.map((l, i) => {
    const quem = l.criado_por_nome ? ` (${l.criado_por_nome})` : "";
    return `${i + 1}. [${ddmm(l.criado_em)}${quem}] ${l.texto}`;
  });
  return `📝 *Lembretes pendentes (${lembs.length}):*\n${linhas.join("\n")}`;
}

// ─── Mapa de despacho (chave = escopo_dados.consulta_dedicada da regra) ──────

export const LEITORES_GESTOR: Record<string, LeitoresGestorFn> = {
  andamentoRotas,
  resumoDia,
  entregasDia,
  pedidosAbertos,
  vencimentos,
  ondeEsta,
  meusLembretes,
};

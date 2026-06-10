/**
 * Coletor de eventos financeiros — agrega de todas as fontes
 * num formato unificado pra fluxo de caixa.
 *
 * Fontes:
 *  - pedidos (entrada: valor_pedido)
 *  - abastecimentos (saída — custo do veículo)
 *  - despesas_veiculo (saída — pedágio, alimentação, hospedagem, lavagem, etc)
 *  - manutencoes realizadas (saída) + previstas (saída/provisão)
 *  - adiantamentos (saída)
 *  - despesas_avulsas (saída)
 *  - recorrencias_financeiras (gera N eventos por mês entre data_inicio e data_fim)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rotuloPedido } from "@/lib/utils/numeroPedido";

export type CategoriaEvento =
  | "pedido" | "combustivel" | "despesa_veiculo" | "manutencao"
  | "manutencao_provisao" | "adiantamento" | "salario" | "avulsa" | "recorrente";

export type EventoFinanceiro = {
  id: string;
  data: string;            // ISO date (YYYY-MM-DD)
  descricao: string;
  categoria: CategoriaEvento;
  valor: number;           // sempre positivo
  tipo: "entrada" | "saida";
  pago: boolean;
  isProvisao: boolean;     // true = previsão (não está na base como evento; calculado)
  origem: { tabela: string; id: string };  // pra dar baixa / editar
  contexto?: string;       // ex: "Veículo XYZ" / "Motorista João"
};

export type ColetorOpts = {
  empresas: string[];      // empresas do gestor (1+); fluxo soma todas
  inicio: string;          // ISO date inclusivo
  fim: string;             // ISO date inclusivo
  incluirProvisaoManutencao: boolean;
};

const formatLocalISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return formatLocalISO(d);
};

const isoSomeDate = (year: number, month0: number, day: number) => {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export async function coletarEventos(
  supabase: SupabaseClient,
  opts: ColetorOpts
): Promise<EventoFinanceiro[]> {
  const { empresas, inicio, fim, incluirProvisaoManutencao } = opts;
  const eventos: EventoFinanceiro[] = [];

  // ─── PEDIDOS (entrada: total a receber = valor + acréscimos - descontos) ──
  // Pedido PARCELADO entra como UMA entrada POR PARCELA (valor + vencimento) —
  // antes entrava a bolada inteira numa data só, errando o fluxo de caixa.
  // Acréscimos/descontos: colunas da migration_pedido_acrescimos_descontos —
  // tenta com elas e cai pro select antigo se a migration não rodou ainda.
  const selPedidosBase = "id,numero,valor_pedido,pago,data_pagamento,data_inicio_prevista,data_fim_prevista,status,motoristas(nome)";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pedidosRes: { data: any[] | null; error: { message: string } | null } = await supabase
    .from("pedidos")
    .select(`${selPedidosBase},acrescimos,descontos`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in("empresa_id", empresas) as any;
  if (pedidosRes.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pedidosRes = await supabase
      .from("pedidos")
      .select(selPedidosBase)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .in("empresa_id", empresas) as any;
  }
  if (pedidosRes.error) {
    console.error("Erro ao coletar pedidos:", pedidosRes.error);
    throw new Error(`Erro ao coletar pedidos: ${pedidosRes.error.message}`);
  }
  const pedidos = pedidosRes.data ?? [];

  // Parcelas dos pedidos (pedido_parcelas) — best-effort (tabela pode não existir)
  type ParcelaFluxo = { id: string; pedido_id: string; numero: number; valor: number; vencimento: string | null; pago: boolean; data_pagamento: string | null };
  const parcelasPorPedido = new Map<string, ParcelaFluxo[]>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pars } = await (supabase as any)
      .from("pedido_parcelas")
      .select("id,pedido_id,numero,valor,vencimento,pago,data_pagamento")
      .in("empresa_id", empresas)
      .order("numero", { ascending: true });
    for (const r of (pars ?? []) as ParcelaFluxo[]) {
      const lista = parcelasPorPedido.get(r.pedido_id) ?? [];
      lista.push(r);
      parcelasPorPedido.set(r.pedido_id, lista);
    }
  } catch { /* antes da migration de parcelas — segue só com pedidos */ }

  for (const p of pedidos) {
    const motorista = Array.isArray(p.motoristas) ? p.motoristas[0] : p.motoristas;
    if (p.valor_pedido == null || p.valor_pedido <= 0) continue;
    const totalPedido = Math.round((p.valor_pedido + (p.acrescimos ?? 0) - (p.descontos ?? 0)) * 100) / 100;

    const pars = parcelasPorPedido.get(p.id);
    if (pars && pars.length > 0) {
      // parcelado: uma entrada por parcela, na data de pagamento (paga) ou vencimento
      for (const par of pars) {
        const dataRaw = par.pago && par.data_pagamento
          ? par.data_pagamento
          : (par.vencimento ?? p.data_fim_prevista ?? p.data_inicio_prevista);
        if (!dataRaw) continue;
        eventos.push({
          id: `pedido_parcela_in:${par.id}`,
          data: dataRaw.slice(0, 10),
          descricao: `Pedido ${rotuloPedido(p.numero, p.id)} — parcela ${par.numero}/${pars.length}`,
          categoria: "pedido",
          valor: par.valor,
          tipo: "entrada",
          pago: !!par.pago,
          isProvisao: false,
          origem: { tabela: "pedido_parcelas", id: par.id },
          contexto: motorista?.nome ?? undefined,
        });
      }
      continue;
    }

    // pagamento único (sem parcelas) — comportamento de sempre, com total ajustado
    const dataEntradaRaw = p.pago && p.data_pagamento
      ? p.data_pagamento
      : (p.data_fim_prevista ?? p.data_inicio_prevista);
    if (dataEntradaRaw) {
      eventos.push({
        id: `pedido_in:${p.id}`,
        data: dataEntradaRaw.slice(0, 10),
        descricao: `Pedido ${rotuloPedido(p.numero, p.id)}`,
        categoria: "pedido",
        valor: totalPedido,
        tipo: "entrada",
        pago: !!p.pago,
        isProvisao: false,
        origem: { tabela: "pedidos", id: p.id },
        contexto: motorista?.nome ?? undefined,
      });
    }
  }

  // ─── ABASTECIMENTOS (custo do veículo) ───────────────────────────────────
  const { data: abasts, error: abastsErr } = await supabase
    .from("abastecimentos")
    .select("id,valor_total,pago,data_pagamento,data_vencimento,created_at,posto,veiculos(placa)")
    .in("empresa_id", empresas);

  if (abastsErr) {
    console.error("Erro ao coletar abastecimentos:", abastsErr);
    throw new Error(`Erro ao coletar abastecimentos: ${abastsErr.message}`);
  }

  for (const a of abasts ?? []) {
    if (a.valor_total == null || a.valor_total <= 0) continue;
    const placa = (Array.isArray(a.veiculos) ? a.veiculos[0] : a.veiculos)?.placa;
    const dataRaw = a.pago && a.data_pagamento
      ? a.data_pagamento
      : (a.data_vencimento ?? (a.created_at ? a.created_at : null));
    if (!dataRaw) continue;
    eventos.push({
      id: `abast:${a.id}`,
      data: dataRaw.slice(0, 10),
      descricao: `Combustível${a.posto ? ` — ${a.posto}` : ""}`,
      categoria: "combustivel",
      valor: a.valor_total,
      tipo: "saida",
      pago: !!a.pago,
      isProvisao: false,
      origem: { tabela: "abastecimentos", id: a.id },
      contexto: placa ?? undefined,
    });
  }

  // ─── DESPESAS DO VEÍCULO (pedágio, alimentação, hospedagem, lavagem) ─────
  const { data: despVeic, error: despVeicErr } = await supabase
    .from("despesas_veiculo")
    .select("id,tipo,valor,data_despesa,local,veiculos(placa)")
    .in("empresa_id", empresas);

  if (despVeicErr) {
    console.error("Erro ao coletar despesas do veículo:", despVeicErr);
    throw new Error(`Erro ao coletar despesas do veículo: ${despVeicErr.message}`);
  }

  for (const d of despVeic ?? []) {
    if (d.valor == null || d.valor <= 0) continue;
    const placa = (Array.isArray(d.veiculos) ? d.veiculos[0] : d.veiculos)?.placa;
    if (!d.data_despesa) continue;
    eventos.push({
      id: `desp_veic:${d.id}`,
      data: d.data_despesa.slice(0, 10),
      descricao: `${d.tipo}${d.local ? ` — ${d.local}` : ""}`,
      categoria: "despesa_veiculo",
      valor: d.valor,
      tipo: "saida",
      pago: true,
      isProvisao: false,
      origem: { tabela: "despesas_veiculo", id: d.id },
      contexto: placa ?? undefined,
    });
  }

  // ─── MANUTENÇÕES REALIZADAS ──────────────────────────────────────────────
  const { data: manuts, error: manutsErr } = await supabase
    .from("manutencoes")
    .select("id,custo_total,pago,data_pagamento,data_vencimento,data_realizada,fornecedor,veiculos(placa),tipos_manutencao(nome)")
    .in("empresa_id", empresas);

  if (manutsErr) {
    console.error("Erro ao coletar manutenções:", manutsErr);
    throw new Error(`Erro ao coletar manutenções: ${manutsErr.message}`);
  }

  for (const m of manuts ?? []) {
    if (m.custo_total == null || m.custo_total <= 0) continue;
    const placa = (Array.isArray(m.veiculos) ? m.veiculos[0] : m.veiculos)?.placa;
    const tipo = (Array.isArray(m.tipos_manutencao) ? m.tipos_manutencao[0] : m.tipos_manutencao)?.nome;
    const dataRaw = m.pago && m.data_pagamento
      ? m.data_pagamento
      : (m.data_vencimento ?? m.data_realizada);
    if (!dataRaw) continue;
    eventos.push({
      id: `manut:${m.id}`,
      data: dataRaw.slice(0, 10),
      descricao: `Manutenção${tipo ? ` — ${tipo}` : ""}${m.fornecedor ? ` (${m.fornecedor})` : ""}`,
      categoria: "manutencao",
      valor: m.custo_total,
      tipo: "saida",
      pago: !!m.pago,
      isProvisao: false,
      origem: { tabela: "manutencoes", id: m.id },
      contexto: placa ?? undefined,
    });
  }

  // ─── MANUTENÇÕES PREVISTAS (PROVISÃO) ─────────────────────────────────────
  if (incluirProvisaoManutencao) {
    const { data: prox, error: proxErr } = await supabase
      .from("proxima_manutencao_veiculo")
      .select("veiculo_id,tipo_id,tipo_nome,data_proxima,km_proxima,placa,intervalo_meses,status")
      .in("empresa_id", empresas);

    if (proxErr) {
      console.error("Erro ao coletar previsões de manutenção:", proxErr);
      throw new Error(`Erro ao coletar previsões de manutenção: ${proxErr.message}`);
    }

    const tipoIds = Array.from(new Set((prox ?? []).map(p => p.tipo_id).filter((x): x is string => !!x)));
    const custoMap = new Map<string, number>();
    if (tipoIds.length > 0) {
      const { data: tipos, error: tiposErr } = await supabase
        .from("tipos_manutencao")
        .select("id,custo_estimado_min,custo_estimado_max")
        .in("id", tipoIds);

      if (tiposErr) {
        console.error("Erro ao coletar tipos de manutenção:", tiposErr);
        throw new Error(`Erro ao coletar tipos de manutenção: ${tiposErr.message}`);
      }

      for (const t of tipos ?? []) {
        const min = t.custo_estimado_min ?? 0;
        const max = t.custo_estimado_max ?? 0;
        custoMap.set(t.id, max > 0 ? (min + max) / 2 : min);
      }
    }

    const hoje = formatLocalISO(new Date());

    for (const p of prox ?? []) {
      if (!p.tipo_id || !p.veiculo_id) continue;
      const custo = custoMap.get(p.tipo_id) ?? 0;
      if (custo <= 0) continue;

      let dataProvisao: string | null;

      if (p.status === "vencido") {
        dataProvisao = hoje;
      } else if (p.data_proxima) {
        dataProvisao = p.data_proxima.slice(0, 10);
      } else if (p.intervalo_meses && p.intervalo_meses > 0) {
        dataProvisao = addMonths(hoje, p.intervalo_meses);
      } else {
        continue;
      }

      eventos.push({
        id: `manut_prov:${p.veiculo_id}:${p.tipo_id}`,
        data: dataProvisao as string,
        descricao: `[PROVISÃO] ${p.tipo_nome ?? "Manutenção"}${p.status === "vencido" ? " ⚠ vencida" : ""}`,
        categoria: "manutencao_provisao",
        valor: custo,
        tipo: "saida",
        pago: false,
        isProvisao: true,
        origem: { tabela: "veiculos", id: p.veiculo_id },
        contexto: p.placa ?? undefined,
      });
    }
  }

  // ─── ADIANTAMENTOS ───────────────────────────────────────────────────────
  const { data: adts, error: adtsErr } = await supabase
    .from("adiantamentos")
    .select("id,valor,status,data_pagamento,created_at,motoristas(nome)")
    .in("empresa_id", empresas)
    .in("status", ["aprovado", "pago", "prestado_contas"]);

  if (adtsErr) {
    console.error("Erro ao coletar adiantamentos:", adtsErr);
    throw new Error(`Erro ao coletar adiantamentos: ${adtsErr.message}`);
  }

  for (const a of adts ?? []) {
    if (a.valor == null || a.valor <= 0) continue;
    const motorista = (Array.isArray(a.motoristas) ? a.motoristas[0] : a.motoristas)?.nome;
    const dataRaw = a.data_pagamento ?? (a.created_at ? a.created_at : null);
    if (!dataRaw) continue;
    eventos.push({
      id: `adt:${a.id}`,
      data: dataRaw.slice(0, 10),
      descricao: `Adiantamento${motorista ? ` — ${motorista}` : ""}`,
      categoria: "adiantamento",
      valor: a.valor,
      tipo: "saida",
      pago: a.status === "pago" || a.status === "prestado_contas",
      isProvisao: false,
      origem: { tabela: "adiantamentos", id: a.id },
      contexto: motorista ?? undefined,
    });
  }

  // ─── DESPESAS AVULSAS ────────────────────────────────────────────────────
  const { data: despesas, error: despesasErr } = await supabase
    .from("despesas_avulsas")
    .select("id,descricao,categoria,valor,data_vencimento,data_pagamento,pago,fornecedor")
    .in("empresa_id", empresas);

  if (despesasErr) {
    console.error("Erro ao coletar despesas avulsas:", despesasErr);
    throw new Error(`Erro ao coletar despesas avulsas: ${despesasErr.message}`);
  }

  for (const d of despesas ?? []) {
    if (d.valor == null || d.valor <= 0) continue;
    const dataRaw = d.pago && d.data_pagamento ? d.data_pagamento : d.data_vencimento;
    if (!dataRaw) continue;
    eventos.push({
      id: `avulsa:${d.id}`,
      data: dataRaw.slice(0, 10),
      descricao: d.descricao + (d.fornecedor ? ` (${d.fornecedor})` : ""),
      categoria: "avulsa",
      valor: d.valor,
      tipo: "saida",
      pago: !!d.pago,
      isProvisao: false,
      origem: { tabela: "despesas_avulsas", id: d.id },
      contexto: d.categoria,
    });
  }

  // ─── RECORRÊNCIAS (gera 1 evento por mês dentro do range) ────────────────
  const { data: recs, error: recsErr } = await supabase
    .from("recorrencias_financeiras")
    .select("id,descricao,categoria,tipo,valor,dia_vencimento,data_inicio,data_fim,ativo")
    .in("empresa_id", empresas)
    .eq("ativo", true);

  if (recsErr) {
    console.error("Erro ao coletar recorrências:", recsErr);
    throw new Error(`Erro ao coletar recorrências: ${recsErr.message}`);
  }

  const inicioDate = new Date(inicio + "T00:00:00");
  const fimDate = new Date(fim + "T00:00:00");

  for (const r of recs ?? []) {
    if (r.valor == null || r.valor <= 0) continue;
    const recInicio = new Date((r.data_inicio ?? inicio) + "T00:00:00");
    const recFim = r.data_fim ? new Date(r.data_fim + "T00:00:00") : null;
    const cursor = new Date(Math.max(recInicio.getTime(), inicioDate.getTime()));
    cursor.setDate(1);

    while (cursor <= fimDate) {
      const ano = cursor.getFullYear();
      const mes = cursor.getMonth();
      const dataEvento = isoSomeDate(ano, mes, r.dia_vencimento);
      const dataEventoTs = new Date(dataEvento + "T00:00:00");

      if (dataEventoTs >= recInicio && (!recFim || dataEventoTs <= recFim)
          && dataEventoTs >= inicioDate && dataEventoTs <= fimDate) {
        eventos.push({
          id: `rec:${r.id}:${ano}-${mes + 1}`,
          data: dataEvento.slice(0, 10),
          descricao: r.descricao,
          categoria: "recorrente",
          valor: r.valor,
          tipo: (r.tipo === "entrada" ? "entrada" : "saida"),
          pago: false,
          isProvisao: true,
          origem: { tabela: "recorrencias_financeiras", id: r.id },
          contexto: r.categoria,
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return eventos
    .filter(e =>
      (e.data >= inicio && e.data <= fim) ||
      (!e.pago && !e.isProvisao && e.data < inicio) ||
      (e.isProvisao && e.data < inicio)
    )
    .sort((a, b) => a.data.localeCompare(b.data));
}

export const CAT_COR: Record<CategoriaEvento, string> = {
  pedido: "#16a34a",
  combustivel: "#ea580c",
  despesa_veiculo: "#f97316",
  manutencao: "#dc2626",
  manutencao_provisao: "#94a3b8",
  adiantamento: "#0891b2",
  salario: "#6366f1",
  avulsa: "#475569",
  recorrente: "#8b5cf6",
};

export const CAT_LABEL: Record<CategoriaEvento, string> = {
  pedido: "Pedido",
  combustivel: "Combustível",
  despesa_veiculo: "Despesa Veículo",
  manutencao: "Manutenção",
  manutencao_provisao: "Provisão Manut.",
  adiantamento: "Adiantamento",
  salario: "Salário",
  avulsa: "Avulsa",
  recorrente: "Recorrente",
};

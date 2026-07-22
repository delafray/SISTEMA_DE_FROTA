/**
 * Financeiro por Cliente — dados da tela /faturamento.
 *
 * Antes a tela baixava TODOS os pedidos + parcelas (loadAll) pra agregar no
 * cliente. Agora:
 *   - resumo por cliente vem da RPC `faturamento_clientes`
 *     (db/migration_faturamento_clientes.sql) em UMA chamada — uma linha por
 *     cliente, limitado pelo tamanho do cadastro;
 *   - os pedidos de cada cliente carregam SOB DEMANDA ao expandir, paginados
 *     de 100 em 100 (regra das listagens);
 *   - sem a migration rodada, `buscarGruposClientes` cai no caminho antigo
 *     (loadAll + agregação local) — mesmo padrão de fallback dos KPIs.
 *
 * `agruparPedidosPorCliente` é pura e replica EXATAMENTE a regra de dinheiro
 * que estava na tela: total = valor + acréscimos - descontos; pago = parcelas
 * pagas (parcelado) ou tudo-ou-nada (único); atraso = parcela vencida não paga
 * ou único não pago com fim previsto passado.
 */

import { loadAll } from '@/lib/utils/loadAll';

export interface PedidoFin {
  id: string;
  numero: string | null;
  cliente_id: string | null;
  valor_pedido: number | null;
  pago: boolean | null;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  forma_pagamento: string | null;
  acrescimos?: number | null; // migration_pedido_acrescimos_descontos
  descontos?: number | null;
}

export interface ParcelaFin {
  pedido_id: string;
  valor: number;
  pago: boolean;
  vencimento: string | null;
}

export interface GrupoClienteResumo {
  clienteId: string | null;
  nome: string;
  qtd: number;
  qtdPagos: number;
  valorTotal: number;
  valorPago: number;
  valorAberto: number;
  valorAtrasado: number;
}

/** Total a receber do pedido (valor + acréscimos - descontos). */
export const totalDe = (p: PedidoFin): number =>
  Math.round(((p.valor_pedido ?? 0) + (p.acrescimos ?? 0) - (p.descontos ?? 0)) * 100) / 100;

/** Valor já pago: parcelado → soma das parcelas pagas; único → tudo ou nada. */
export function valorPagoDe(p: PedidoFin, parcelas: ParcelaFin[] | undefined): number {
  if (parcelas && parcelas.length > 0) {
    return parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor ?? 0), 0);
  }
  return p.pago ? totalDe(p) : 0;
}

/** Quitado: parcelado → todas as parcelas pagas; único → flag pago. */
export function estaQuitado(p: PedidoFin, parcelas: ParcelaFin[] | undefined): boolean {
  if (parcelas && parcelas.length > 0) return parcelas.every(x => x.pago);
  return !!p.pago;
}

/** Em atraso: parcela vencida não paga; único não pago com fim previsto passado. */
export function valorAtrasadoDe(
  p: PedidoFin,
  parcelas: ParcelaFin[] | undefined,
  hoje: string
): number {
  if (parcelas && parcelas.length > 0) {
    return parcelas
      .filter(x => !x.pago && x.vencimento && x.vencimento < hoje)
      .reduce((s, x) => s + (x.valor ?? 0), 0);
  }
  if (!p.pago && p.data_fim_prevista && p.data_fim_prevista < hoje) return totalDe(p);
  return 0;
}

/**
 * Agregação por cliente — PURA. Réplica local da RPC `faturamento_clientes`
 * (usada como fallback sem a migration, e como fonte da verdade nos testes).
 */
export function agruparPedidosPorCliente(
  pedidos: PedidoFin[],
  parcelasPorPedido: Map<string, ParcelaFin[]>,
  nomePorCliente: Map<string, string>,
  hoje: string
): GrupoClienteResumo[] {
  const mapa = new Map<string, GrupoClienteResumo>();
  for (const p of pedidos) {
    const key = p.cliente_id ?? '__avulso__';
    const nome = p.cliente_id
      ? (nomePorCliente.get(p.cliente_id) ?? 'Cliente')
      : 'Sem cliente / avulsos';
    const g = mapa.get(key) ?? {
      clienteId: p.cliente_id, nome,
      qtd: 0, qtdPagos: 0, valorTotal: 0, valorPago: 0, valorAberto: 0, valorAtrasado: 0,
    };
    const pars = parcelasPorPedido.get(p.id);
    const total = totalDe(p);
    const pagoValor = valorPagoDe(p, pars);
    g.qtd += 1;
    if (estaQuitado(p, pars)) g.qtdPagos += 1;
    g.valorTotal += total;
    g.valorPago += pagoValor;
    g.valorAberto += total - pagoValor;
    g.valorAtrasado += valorAtrasadoDe(p, pars, hoje);
    mapa.set(key, g);
  }
  return Array.from(mapa.values()).sort((a, b) => b.valorAberto - a.valorAberto);
}

// ─── Acesso a dados ─────────────────────────────────────────────────────────

interface RespostaRpc {
  data: unknown;
  error: { message?: string } | null;
}

interface ClienteRpc {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RespostaRpc>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(tabela: string): any;
}

/** PostgREST pode serializar numeric como number ou string — normaliza. */
function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

const SEL_PEDIDO_BASE =
  'id,numero,cliente_id,valor_pedido,pago,status,data_inicio_prevista,data_fim_prevista,forma_pagamento';

/** Pedidos "faturáveis" — mesmos filtros da RPC (valor > 0, não cancelado). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queryPedidosFaturaveis(supabase: ClienteRpc, empresaId: string, sel: string): any {
  return supabase
    .from('pedidos')
    .select(sel)
    .eq('empresa_id', empresaId)
    .not('valor_pedido', 'is', null)
    .gt('valor_pedido', 0)
    .not('status', 'in', '(cancelada,cancelado)')
    .order('created_at', { ascending: false });
}

/**
 * Resumo por cliente. RPC em uma chamada; sem a migration, cai no caminho
 * antigo (loadAll de pedidos + parcelas + clientes e agregação local).
 */
export async function buscarGruposClientes(
  supabaseRaw: unknown,
  empresaId: string,
  hoje: string
): Promise<GrupoClienteResumo[]> {
  const supabase = supabaseRaw as ClienteRpc;

  try {
    const { data, error } = await supabase.rpc('faturamento_clientes', {
      p_empresa_id: empresaId,
      p_hoje: hoje,
    });
    if (!error && Array.isArray(data)) {
      return (data as Record<string, unknown>[]).map(r => ({
        clienteId: (r.cliente_id ?? null) as string | null,
        nome: (r.nome as string) ?? 'Cliente',
        qtd: num(r.qtd),
        qtdPagos: num(r.qtd_pagos),
        valorTotal: num(r.valor_total),
        valorPago: num(r.valor_pago),
        valorAberto: num(r.valor_aberto),
        valorAtrasado: num(r.valor_atrasado),
      }));
    }
  } catch {
    // função ainda não existe no banco → fallback abaixo
  }

  // ── Fallback (migration não rodada): comportamento antigo da tela ──
  const buscarPedidos = (sel: string) =>
    loadAll<PedidoFin>((from, to) => queryPedidosFaturaveis(supabase, empresaId, sel).range(from, to));

  const [pedidos, clientesRes, parcelas] = await Promise.all([
    buscarPedidos(`${SEL_PEDIDO_BASE},acrescimos,descontos`).catch(() => buscarPedidos(SEL_PEDIDO_BASE)),
    supabase.from('clientes').select('id,nome_fantasia,apelido').eq('empresa_id', empresaId),
    loadAll<ParcelaFin>((from, to) =>
      supabase.from('pedido_parcelas').select('pedido_id,valor,pago,vencimento')
        .eq('empresa_id', empresaId).range(from, to)
    ).catch(() => [] as ParcelaFin[]),
  ]);

  const nomePorCliente = new Map<string, string>();
  for (const c of (clientesRes as { data?: { id: string; nome_fantasia: string | null; apelido: string | null }[] }).data ?? []) {
    nomePorCliente.set(c.id, c.nome_fantasia ?? c.apelido ?? 'Cliente');
  }

  const porPedido = new Map<string, ParcelaFin[]>();
  for (const p of parcelas) {
    const lista = porPedido.get(p.pedido_id) ?? [];
    lista.push(p);
    porPedido.set(p.pedido_id, lista);
  }

  return agruparPedidosPorCliente(pedidos, porPedido, nomePorCliente, hoje);
}

export interface PaginaPedidosCliente {
  pedidos: PedidoFin[];
  parcelasPorPedido: Map<string, ParcelaFin[]>;
  temMais: boolean;
}

export const PAGE_SIZE_PEDIDOS_CLIENTE = 100;

/**
 * Pedidos de UM cliente (ou dos avulsos, clienteId = null), paginados de 100
 * em 100, com as parcelas só desses pedidos. Chamado ao expandir o cliente.
 */
export async function buscarPedidosDoCliente(
  supabaseRaw: unknown,
  empresaId: string,
  clienteId: string | null,
  pagina: number
): Promise<PaginaPedidosCliente> {
  const supabase = supabaseRaw as ClienteRpc;
  const from = pagina * PAGE_SIZE_PEDIDOS_CLIENTE;
  const to = from + PAGE_SIZE_PEDIDOS_CLIENTE - 1;

  const buscar = async (sel: string): Promise<PedidoFin[]> => {
    let q = queryPedidosFaturaveis(supabase, empresaId, sel);
    q = clienteId ? q.eq('cliente_id', clienteId) : q.is('cliente_id', null);
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return (data ?? []) as PedidoFin[];
  };

  const pedidos = await buscar(`${SEL_PEDIDO_BASE},acrescimos,descontos`).catch(() => buscar(SEL_PEDIDO_BASE));

  const parcelasPorPedido = new Map<string, ParcelaFin[]>();
  if (pedidos.length > 0) {
    const { data } = await supabase
      .from('pedido_parcelas')
      .select('pedido_id,valor,pago,vencimento')
      .in('pedido_id', pedidos.map(p => p.id));
    for (const p of (data ?? []) as ParcelaFin[]) {
      const lista = parcelasPorPedido.get(p.pedido_id) ?? [];
      lista.push(p);
      parcelasPorPedido.set(p.pedido_id, lista);
    }
  }

  return { pedidos, parcelasPorPedido, temMais: pedidos.length >= PAGE_SIZE_PEDIDOS_CLIENTE };
}

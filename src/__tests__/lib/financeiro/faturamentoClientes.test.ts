import { describe, it, expect, vi } from 'vitest';
import {
  totalDe,
  valorPagoDe,
  estaQuitado,
  valorAtrasadoDe,
  agruparPedidosPorCliente,
  buscarGruposClientes,
  buscarPedidosDoCliente,
  type PedidoFin,
  type ParcelaFin,
} from '@/lib/financeiro/faturamentoClientes';

const HOJE = '2026-07-22';

function pedido(over: Partial<PedidoFin>): PedidoFin {
  return {
    id: 'p1', numero: null, cliente_id: 'c1', valor_pedido: 1000, pago: false,
    status: 'concluida', data_inicio_prevista: null, data_fim_prevista: null,
    forma_pagamento: null, ...over,
  };
}

describe('totalDe', () => {
  it('valor + acréscimos - descontos, arredondado a 2 casas', () => {
    expect(totalDe(pedido({ valor_pedido: 1000, acrescimos: 100.005, descontos: 50 }))).toBe(1050.01);
  });
  it('sem acréscimos/descontos (migration ausente) usa só o valor', () => {
    expect(totalDe(pedido({ valor_pedido: 1600 }))).toBe(1600);
  });
});

describe('valorPagoDe / estaQuitado', () => {
  it('parcelado: soma só as parcelas pagas; quitado exige todas pagas', () => {
    const pars: ParcelaFin[] = [
      { pedido_id: 'p1', valor: 500, pago: true, vencimento: '2026-07-01' },
      { pedido_id: 'p1', valor: 500, pago: false, vencimento: '2026-08-01' },
    ];
    const p = pedido({ pago: false });
    expect(valorPagoDe(p, pars)).toBe(500);
    expect(estaQuitado(p, pars)).toBe(false);
  });

  it('único: tudo ou nada pela flag pago (parcelas vazias não contam como parcelado)', () => {
    expect(valorPagoDe(pedido({ pago: true, valor_pedido: 800 }), [])).toBe(800);
    expect(valorPagoDe(pedido({ pago: false }), undefined)).toBe(0);
    expect(estaQuitado(pedido({ pago: true }), [])).toBe(true);
  });
});

describe('valorAtrasadoDe', () => {
  it('parcelado: só parcelas vencidas e não pagas', () => {
    const pars: ParcelaFin[] = [
      { pedido_id: 'p1', valor: 300, pago: false, vencimento: '2026-07-21' }, // vencida
      { pedido_id: 'p1', valor: 300, pago: true, vencimento: '2026-07-01' },  // paga
      { pedido_id: 'p1', valor: 400, pago: false, vencimento: '2026-08-01' }, // futura
      { pedido_id: 'p1', valor: 100, pago: false, vencimento: null },          // sem vencimento
    ];
    expect(valorAtrasadoDe(pedido({}), pars, HOJE)).toBe(300);
  });

  it('único: total do pedido se não pago e fim previsto passou', () => {
    expect(valorAtrasadoDe(pedido({ data_fim_prevista: '2026-07-21' }), undefined, HOJE)).toBe(1000);
    expect(valorAtrasadoDe(pedido({ data_fim_prevista: '2026-07-22' }), undefined, HOJE)).toBe(0); // vence hoje ≠ atrasado
    expect(valorAtrasadoDe(pedido({ pago: true, data_fim_prevista: '2026-01-01' }), undefined, HOJE)).toBe(0);
  });
});

describe('agruparPedidosPorCliente', () => {
  it('agrupa por cliente, soma valores e ordena por valor em aberto desc', () => {
    const pedidos: PedidoFin[] = [
      pedido({ id: 'p1', cliente_id: 'c1', valor_pedido: 1000, pago: true }),
      pedido({ id: 'p2', cliente_id: 'c1', valor_pedido: 500, pago: false }),
      pedido({ id: 'p3', cliente_id: 'c2', valor_pedido: 3000, pago: false, data_fim_prevista: '2026-07-01' }),
      pedido({ id: 'p4', cliente_id: null, valor_pedido: 200, pago: false }),
    ];
    const nomes = new Map([['c1', 'Alfa'], ['c2', 'Beta']]);

    const grupos = agruparPedidosPorCliente(pedidos, new Map(), nomes, HOJE);

    expect(grupos.map(g => g.nome)).toEqual(['Beta', 'Alfa', 'Sem cliente / avulsos']);
    const [beta, alfa, avulso] = grupos;
    expect(beta).toMatchObject({ qtd: 1, qtdPagos: 0, valorTotal: 3000, valorAberto: 3000, valorAtrasado: 3000 });
    expect(alfa).toMatchObject({ qtd: 2, qtdPagos: 1, valorTotal: 1500, valorPago: 1000, valorAberto: 500, valorAtrasado: 0 });
    expect(avulso).toMatchObject({ clienteId: null, qtd: 1, valorAberto: 200 });
  });

  it('pedido parcelado entra pelo somatório das parcelas', () => {
    const pedidos = [pedido({ id: 'p1', valor_pedido: 900, pago: false })];
    const pars = new Map<string, ParcelaFin[]>([['p1', [
      { pedido_id: 'p1', valor: 300, pago: true, vencimento: '2026-06-01' },
      { pedido_id: 'p1', valor: 300, pago: false, vencimento: '2026-07-01' },
      { pedido_id: 'p1', valor: 300, pago: false, vencimento: '2026-09-01' },
    ]]]);

    const [g] = agruparPedidosPorCliente(pedidos, pars, new Map([['c1', 'Alfa']]), HOJE);

    expect(g.valorTotal).toBe(900);
    expect(g.valorPago).toBe(300);
    expect(g.valorAberto).toBe(600);
    expect(g.valorAtrasado).toBe(300); // só a vencida de 07/01
    expect(g.qtdPagos).toBe(0);
  });
});

// ─── acesso a dados (RPC + fallback) ────────────────────────────────────────

function queryFake(linhas: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'or', 'order', 'range', 'not', 'gt', 'is', 'in']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
    resolve({ data: linhas, error: null });
  return q;
}

describe('buscarGruposClientes', () => {
  it('usa a RPC quando ela existe (numeric como string incluso)', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        cliente_id: 'c1', nome: 'Alfa', qtd: 2, qtd_pagos: '1',
        valor_total: '1500', valor_pago: 1000, valor_aberto: '500', valor_atrasado: 0,
      }],
      error: null,
    }));
    const supabase = { rpc, from: vi.fn() };

    const grupos = await buscarGruposClientes(supabase, 'emp-1', HOJE);

    expect(rpc).toHaveBeenCalledWith('faturamento_clientes', { p_empresa_id: 'emp-1', p_hoje: HOJE });
    expect(grupos).toEqual([{
      clienteId: 'c1', nome: 'Alfa', qtd: 2, qtdPagos: 1,
      valorTotal: 1500, valorPago: 1000, valorAberto: 500, valorAtrasado: 0,
    }]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('RPC inexistente → fallback agrega localmente (pedidos + clientes + parcelas)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not found' } }));
    const respostas: Record<string, unknown[]> = {
      pedidos: [pedido({ id: 'p1', cliente_id: 'c1', valor_pedido: 700, pago: false })],
      clientes: [{ id: 'c1', nome_fantasia: 'Alfa', apelido: null }],
      pedido_parcelas: [],
    };
    const from = vi.fn((tabela: string) => queryFake(respostas[tabela] ?? []));

    const grupos = await buscarGruposClientes({ rpc, from }, 'emp-1', HOJE);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ clienteId: 'c1', nome: 'Alfa', qtd: 1, valorAberto: 700 });
  });
});

describe('buscarPedidosDoCliente', () => {
  it('pagina pedidos do cliente e busca parcelas só desses pedidos', async () => {
    const pedidos = [pedido({ id: 'p1' }), pedido({ id: 'p2' })];
    const parcelas = [{ pedido_id: 'p1', valor: 100, pago: false, vencimento: null }];
    let chamada = 0;
    const from = vi.fn((tabela: string) => {
      chamada++;
      return queryFake(tabela === 'pedidos' ? pedidos : parcelas);
    });

    const r = await buscarPedidosDoCliente({ rpc: vi.fn(), from }, 'emp-1', 'c1', 0);

    expect(r.pedidos).toHaveLength(2);
    expect(r.parcelasPorPedido.get('p1')).toHaveLength(1);
    expect(r.temMais).toBe(false); // 2 < PAGE_SIZE
    expect(chamada).toBe(2); // pedidos + parcelas
  });

  it('clienteId null usa .is(cliente_id, null) — grupo dos avulsos', async () => {
    const q = queryFake([]);
    const from = vi.fn(() => q);

    await buscarPedidosDoCliente({ rpc: vi.fn(), from }, 'emp-1', null, 0);

    expect(q.is).toHaveBeenCalledWith('cliente_id', null);
    expect(q.eq).not.toHaveBeenCalledWith('cliente_id', expect.anything());
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  somasAbastecimentos,
  somasAdiantamentos,
  receitaPedidosConcluidos,
} from '@/lib/financeiro/kpis';

/** Query builder fake: todo método encadeia, e o await resolve com as linhas dadas. */
function queryFake(linhas: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'or', 'order', 'range']) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: linhas });
  return q;
}

describe('somasAbastecimentos', () => {
  it('usa a RPC quando ela existe (inclusive numeric vindo como string)', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ qtd: 3, litros: '150.5', valor_total: 900 }],
      error: null,
    }));
    const supabase = { rpc, from: vi.fn() };

    const r = await somasAbastecimentos(supabase, 'emp-1');

    expect(rpc).toHaveBeenCalledWith('somas_abastecimentos', { p_empresa_id: 'emp-1' });
    expect(r).toEqual({ litros: 150.5, valorTotal: 900 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('RPC inexistente (migration não rodada) → fallback loadAll soma no cliente', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'function not found' } }));
    const q = queryFake([
      { litros: 100, valor_total: 500 },
      { litros: 50, valor_total: 250 },
    ]);
    const supabase = { rpc, from: vi.fn(() => q) };

    const r = await somasAbastecimentos(supabase, 'emp-1');

    expect(r).toEqual({ litros: 150, valorTotal: 750 });
    expect(supabase.from).toHaveBeenCalledWith('abastecimentos');
  });
});

describe('somasAdiantamentos', () => {
  it('usa a RPC quando ela existe', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ solicitado: 1000, aprovado: 600, pendente: 300, prestado: 100 }],
      error: null,
    }));

    const r = await somasAdiantamentos({ rpc, from: vi.fn() }, 'emp-1');

    expect(r).toEqual({ solicitado: 1000, aprovado: 600, pendente: 300, prestado: 100 });
  });

  it('fallback: soma por status igual ao comportamento antigo da tela', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'nope' } }));
    const q = queryFake([
      { valor: 100, status: 'aprovado' },
      { valor: 50, status: 'pendente' },
      { valor: 30, status: 'prestado' },
      { valor: 20, status: 'rejeitado' },
    ]);

    const r = await somasAdiantamentos({ rpc, from: vi.fn(() => q) }, 'emp-1');

    expect(r).toEqual({ solicitado: 200, aprovado: 100, pendente: 50, prestado: 30 });
  });
});

describe('receitaPedidosConcluidos', () => {
  it('usa a RPC quando ela existe', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ receita_concluidos: '5000', receita_pagos: '3200' }],
      error: null,
    }));

    const r = await receitaPedidosConcluidos({ rpc, from: vi.fn() }, 'emp-1');

    expect(r).toEqual({ receitaTotal: 5000, receitaPaga: 3200 });
  });

  it('fallback: duas consultas loadAll (concluídos e concluídos+pagos)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'nope' } }));
    const chamadas: unknown[][] = [
      [{ valor_pedido: 300 }, { valor_pedido: 200 }], // concluídos
      [{ valor_pedido: 200 }],                        // concluídos pagos
    ];
    const from = vi.fn(() => queryFake(chamadas[from.mock.calls.length - 1] ?? []));

    const r = await receitaPedidosConcluidos({ rpc, from }, 'emp-1');

    expect(r).toEqual({ receitaTotal: 500, receitaPaga: 200 });
  });

  it('RPC que lança exceção também cai no fallback (não explode a tela)', async () => {
    const rpc = vi.fn(async () => { throw new Error('rede'); });
    const from = vi.fn(() => queryFake([]));

    const r = await receitaPedidosConcluidos({ rpc, from }, 'emp-1');

    expect(r).toEqual({ receitaTotal: 0, receitaPaga: 0 });
  });
});

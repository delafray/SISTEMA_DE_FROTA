/**
 * Cálculo do ACERTO MENSAL do motorista — extraído do AcertoMensalTab pra ser
 * puro e testável (é dinheiro: salário + diárias + ajustes - adiantamentos).
 *
 * Modelo (sem comissão — decisão do dono):
 *   final = saldo_anterior
 *         + salário fixo
 *         + (valor_diaria_por_pedido × qtd de pedidos concluídos no mês)
 *         + ajustes (bonus/reembolso somam; desconto e demais tipos subtraem)
 *         - adiantamentos pagos no mês
 */

export interface AjusteAcerto {
  /** 'bonus' | 'reembolso' somam; qualquer outro tipo (ex.: 'desconto') subtrai */
  tipo: string;
  valor: number | string | null;
}

export interface EntradaAcerto {
  salarioFixo: number | string | null | undefined;
  valorDiariaPorPedido: number | string | null | undefined;
  qtdPedidos: number;
  ajustes: AjusteAcerto[];
  valoresAdiantamentos: Array<number | string | null | undefined>;
  saldoAnterior: number | string | null | undefined;
}

export interface TotaisAcerto {
  salarioFixo: number;
  valorDiaria: number;
  qtdPedidos: number;
  totalDiarias: number;
  ajustes: number;
  adiantamentos: number;
  final: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function calcularTotaisAcerto(e: EntradaAcerto): TotaisAcerto {
  const salarioFixo = num(e.salarioFixo);
  const valorDiaria = num(e.valorDiariaPorPedido);
  const qtdPedidos = e.qtdPedidos;
  const totalDiarias = valorDiaria * qtdPedidos;

  let ajustesVal = 0;
  for (const a of e.ajustes) {
    const v = num(a.valor);
    if (a.tipo === 'bonus' || a.tipo === 'reembolso') ajustesVal += v;
    else ajustesVal -= v;
  }

  const totalAdiantamentos = e.valoresAdiantamentos.reduce<number>((s, v) => s + num(v), 0);

  const final =
    num(e.saldoAnterior) + salarioFixo + totalDiarias + ajustesVal - totalAdiantamentos;

  return {
    salarioFixo,
    valorDiaria,
    qtdPedidos,
    totalDiarias,
    ajustes: ajustesVal,
    adiantamentos: totalAdiantamentos,
    final,
  };
}

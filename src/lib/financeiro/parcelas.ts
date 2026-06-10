/**
 * Lógica de parcelas do pedido — geração padrão e RECONCILIAÇÃO em cascata
 * (decisão do dono, 10/06/2026):
 *
 * - Total a receber = valor do pedido + acréscimos - descontos.
 * - Gerar N parcelas: divide o total igualmente, 1ª vence HOJE e as demais a
 *   cada +30 dias; sobra de centavos vai na última.
 * - Editar o valor de uma parcela e salvar: as parcelas ANTERIORES (e as já
 *   PAGAS) ficam como estão; as parcelas seguintes NÃO pagas dividem o
 *   restante igualmente. Ex.: 3.000 em 3x (1000/1000/1000) → mudo a 1ª pra
 *   1.500 → as duas seguintes viram 750/750; depois mudo a 2ª pra 500 → o
 *   resto (1.000) fica na última.
 * - A soma das parcelas NUNCA pode divergir do total — funções retornam erro
 *   em vez de deixar furo.
 *
 * Funções puras (sem IO) — cobertas por src/__tests__/lib/financeiro/parcelas.test.ts.
 */

export type ParcelaCalc = {
  numero: number;
  valor: number;
  pago: boolean;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Soma com arredondamento de centavos (evita 0.1+0.2 = 0.30000000004). */
const soma = (vals: number[]) => round2(vals.reduce((s, v) => s + v, 0));

/** Total a receber do pedido: valor + acréscimos - descontos (nunca negativo retorna como está — validação é de quem chama). */
export function totalAReceber(valorPedido: number, acrescimos: number, descontos: number): number {
  return round2(valorPedido + (acrescimos || 0) - (descontos || 0));
}

/** Soma ISO date + N dias (YYYY-MM-DD). */
export function addDiasISO(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Gera N parcelas iguais a partir do total. 1ª vence em `primeiroVencimento`
 * (padrão: hoje) e as seguintes a cada +30 dias. Centavos na última.
 */
export function gerarParcelasPadrao(
  total: number,
  n: number,
  primeiroVencimento: string
): Array<{ numero: number; valor: number; vencimento: string }> | { erro: string } {
  if (!Number.isFinite(n) || n < 1 || n > 36) return { erro: "Quantidade de parcelas inválida (1 a 36)." };
  if (!Number.isFinite(total) || total <= 0) return { erro: "Total a receber precisa ser maior que zero." };

  const base = Math.floor((total / n) * 100) / 100;
  const ultima = round2(total - base * (n - 1));
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valor: i === n - 1 ? ultima : base,
    vencimento: addDiasISO(primeiroVencimento, 30 * i),
  }));
}

/**
 * RECONCILIAÇÃO em cascata ao editar o valor da parcela `idx` (0-based):
 * - parcelas 0..idx mantêm seus valores (idx recebe `novoValor`);
 * - parcelas PAGAS depois de idx não mudam;
 * - o restante (total - tudo que está fixo) é dividido igualmente entre as
 *   parcelas NÃO pagas depois de idx (centavos na última delas).
 *
 * Retorna os novos valores (mesma ordem) ou { erro } — a soma SEMPRE fecha
 * com o total quando dá certo.
 */
export function redistribuirAposEdicao(
  parcelas: ParcelaCalc[],
  idx: number,
  novoValor: number,
  total: number
): number[] | { erro: string } {
  if (idx < 0 || idx >= parcelas.length) return { erro: "Parcela inválida." };
  if (parcelas[idx].pago) return { erro: "Parcela já paga — estorne antes de alterar o valor." };
  const v = round2(novoValor);
  if (!Number.isFinite(v) || v <= 0) return { erro: "Valor da parcela precisa ser maior que zero." };

  const valores = parcelas.map(p => round2(p.valor));
  valores[idx] = v;

  const fixas = soma([
    ...valores.slice(0, idx + 1),
    ...parcelas.slice(idx + 1).filter(p => p.pago).map(p => round2(p.valor)),
  ]);
  const restante = round2(total - fixas);

  const editaveisIdx = parcelas
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i > idx && !p.pago)
    .map(({ i }) => i);

  if (editaveisIdx.length === 0) {
    // não há quem absorva a diferença — só aceita se fechar exato
    if (Math.abs(restante) > 0.009) {
      return { erro: `Não há parcelas seguintes pra ajustar — esse valor deixa o total ${restante > 0 ? "faltando" : "passando"} ${Math.abs(restante).toFixed(2)}.` };
    }
    return valores;
  }

  if (restante < -0.009) {
    return { erro: "Esse valor passa do total a receber — diminua a parcela ou ajuste acréscimos/descontos." };
  }
  if (restante < 0.009 && editaveisIdx.length > 0) {
    return { erro: "Esse valor não deixa nada para as parcelas seguintes — diminua a parcela ou remova parcelas." };
  }

  const n = editaveisIdx.length;
  const base = Math.floor((restante / n) * 100) / 100;
  editaveisIdx.forEach((i, k) => {
    valores[i] = k === n - 1 ? round2(restante - base * (n - 1)) : base;
  });
  return valores;
}

/**
 * Redistribui as parcelas NÃO pagas pra fechar com um novo total (usado quando
 * acréscimos/descontos mudam). Pagas ficam intactas.
 */
export function redistribuirNaoPagas(
  parcelas: ParcelaCalc[],
  total: number
): number[] | { erro: string } {
  const pagasSoma = soma(parcelas.filter(p => p.pago).map(p => p.valor));
  const restante = round2(total - pagasSoma);
  const abertasIdx = parcelas.map((p, i) => ({ p, i })).filter(({ p }) => !p.pago).map(({ i }) => i);

  if (abertasIdx.length === 0) {
    if (Math.abs(restante) > 0.009) {
      return { erro: `Todas as parcelas já estão pagas (${pagasSoma.toFixed(2)}) — o novo total não fecha. Estorne uma parcela antes.` };
    }
    return parcelas.map(p => round2(p.valor));
  }
  if (restante < 0.009) {
    return { erro: "O que já foi pago passa do novo total — confira acréscimos/descontos ou estorne uma parcela." };
  }

  const valores = parcelas.map(p => round2(p.valor));
  const n = abertasIdx.length;
  const base = Math.floor((restante / n) * 100) / 100;
  abertasIdx.forEach((i, k) => {
    valores[i] = k === n - 1 ? round2(restante - base * (n - 1)) : base;
  });
  return valores;
}

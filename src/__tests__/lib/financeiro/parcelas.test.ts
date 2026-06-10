/**
 * Testes da lógica de parcelas (geração padrão + reconciliação em cascata).
 * Cenário-guia do dono: 3.000 em 3x → mudo a 1ª pra 1.500 → 750/750;
 * depois mudo a 2ª pra 500 → o resto (1.000) vai pra última. Soma NUNCA diverge.
 */

import { describe, it, expect } from "vitest";
import {
  totalAReceber,
  addDiasISO,
  gerarParcelasPadrao,
  redistribuirAposEdicao,
  redistribuirNaoPagas,
  type ParcelaCalc,
} from "@/lib/financeiro/parcelas";

const soma = (vals: number[]) => Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100;
const abertas = (valores: number[]): ParcelaCalc[] =>
  valores.map((v, i) => ({ numero: i + 1, valor: v, pago: false }));

describe("totalAReceber", () => {
  it("soma acréscimos e subtrai descontos", () => {
    expect(totalAReceber(3000, 150, 50)).toBe(3100);
    expect(totalAReceber(3000, 0, 0)).toBe(3000);
  });
});

describe("addDiasISO", () => {
  it("soma 30 dias cruzando mês e ano", () => {
    expect(addDiasISO("2026-06-10", 30)).toBe("2026-07-10");
    expect(addDiasISO("2026-12-15", 30)).toBe("2027-01-14");
  });
});

describe("gerarParcelasPadrao", () => {
  it("3.000 em 3x → 1.000 cada, vencendo hoje, +30 e +60 dias", () => {
    const r = gerarParcelasPadrao(3000, 3, "2026-06-10");
    expect(Array.isArray(r)).toBe(true);
    const parcelas = r as Array<{ numero: number; valor: number; vencimento: string }>;
    expect(parcelas.map(p => p.valor)).toEqual([1000, 1000, 1000]);
    expect(parcelas.map(p => p.vencimento)).toEqual(["2026-06-10", "2026-07-10", "2026-08-09"]);
  });

  it("centavos que não dividem vão pra última (100 em 3x = 33.33/33.33/33.34)", () => {
    const parcelas = gerarParcelasPadrao(100, 3, "2026-06-10") as Array<{ valor: number }>;
    expect(parcelas.map(p => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(soma(parcelas.map(p => p.valor))).toBe(100);
  });

  it("rejeita quantidade ou total inválidos", () => {
    expect(gerarParcelasPadrao(3000, 0, "2026-06-10")).toHaveProperty("erro");
    expect(gerarParcelasPadrao(3000, 37, "2026-06-10")).toHaveProperty("erro");
    expect(gerarParcelasPadrao(0, 3, "2026-06-10")).toHaveProperty("erro");
  });
});

describe("redistribuirAposEdicao — cenário-guia do dono", () => {
  it("3.000 em 3x: 1ª vira 1.500 → as duas seguintes dividem (750/750)", () => {
    const r = redistribuirAposEdicao(abertas([1000, 1000, 1000]), 0, 1500, 3000);
    expect(r).toEqual([1500, 750, 750]);
  });

  it("…depois a 2ª vira 500 → o resto fica na última (1.000)", () => {
    const r = redistribuirAposEdicao(abertas([1500, 750, 750]), 1, 500, 3000);
    expect(r).toEqual([1500, 500, 1000]);
  });

  it("a soma fecha SEMPRE com o total, mesmo com centavos", () => {
    const r = redistribuirAposEdicao(abertas([333.33, 333.33, 333.34]), 0, 100.01, 1000) as number[];
    expect(soma(r)).toBe(1000);
    expect(r[0]).toBe(100.01);
  });

  it("parcelas anteriores ficam intactas", () => {
    const r = redistribuirAposEdicao(abertas([500, 500, 1000, 1000]), 2, 800, 3000) as number[];
    expect(r[0]).toBe(500);
    expect(r[1]).toBe(500);
    expect(r[2]).toBe(800);
    expect(r[3]).toBe(1200);
  });

  it("parcela PAGA depois da editada não muda — só as abertas absorvem", () => {
    const parcelas: ParcelaCalc[] = [
      { numero: 1, valor: 1000, pago: false },
      { numero: 2, valor: 1000, pago: true },  // paga: intocável
      { numero: 3, valor: 1000, pago: false },
    ];
    const r = redistribuirAposEdicao(parcelas, 0, 1200, 3000);
    expect(r).toEqual([1200, 1000, 800]);
  });

  it("recusa valor que passa do total", () => {
    expect(redistribuirAposEdicao(abertas([1000, 1000, 1000]), 0, 3200, 3000)).toHaveProperty("erro");
  });

  it("recusa valor que zera as parcelas seguintes", () => {
    expect(redistribuirAposEdicao(abertas([1000, 1000, 1000]), 0, 3000, 3000)).toHaveProperty("erro");
  });

  it("recusa editar parcela paga ou valor <= 0", () => {
    const pagas: ParcelaCalc[] = [{ numero: 1, valor: 1000, pago: true }, { numero: 2, valor: 2000, pago: false }];
    expect(redistribuirAposEdicao(pagas, 0, 500, 3000)).toHaveProperty("erro");
    expect(redistribuirAposEdicao(abertas([1000, 2000]), 0, 0, 3000)).toHaveProperty("erro");
  });

  it("última parcela só aceita valor que fecha exato (não tem quem absorva)", () => {
    expect(redistribuirAposEdicao(abertas([1000, 1000, 1000]), 2, 900, 3000)).toHaveProperty("erro");
    expect(redistribuirAposEdicao(abertas([1000, 1000, 900]), 2, 1000, 3000)).toEqual([1000, 1000, 1000]);
  });
});

describe("redistribuirNaoPagas (mudança de acréscimos/descontos)", () => {
  it("redistribui só as abertas pra fechar o novo total", () => {
    const parcelas: ParcelaCalc[] = [
      { numero: 1, valor: 1000, pago: true },
      { numero: 2, valor: 1000, pago: false },
      { numero: 3, valor: 1000, pago: false },
    ];
    // novo total 3.100 (acréscimo de 100) → abertas dividem 2.100
    const r = redistribuirNaoPagas(parcelas, 3100);
    expect(r).toEqual([1000, 1050, 1050]);
  });

  it("recusa quando o pago passa do novo total", () => {
    const parcelas: ParcelaCalc[] = [
      { numero: 1, valor: 2000, pago: true },
      { numero: 2, valor: 1000, pago: false },
    ];
    expect(redistribuirNaoPagas(parcelas, 1500)).toHaveProperty("erro");
  });

  it("tudo pago e total igual → mantém; total diferente → erro", () => {
    const parcelas: ParcelaCalc[] = [
      { numero: 1, valor: 1500, pago: true },
      { numero: 2, valor: 1500, pago: true },
    ];
    expect(redistribuirNaoPagas(parcelas, 3000)).toEqual([1500, 1500]);
    expect(redistribuirNaoPagas(parcelas, 2800)).toHaveProperty("erro");
  });
});

import { describe, it, expect } from 'vitest';
import { calcularTotaisAcerto } from '@/lib/financeiro/acertoMensal';

const base = {
  salarioFixo: 0,
  valorDiariaPorPedido: 0,
  qtdPedidos: 0,
  ajustes: [],
  valoresAdiantamentos: [],
  saldoAnterior: 0,
};

describe('calcularTotaisAcerto', () => {
  it('diária × pedidos concluídos (regra central do modelo)', () => {
    const t = calcularTotaisAcerto({ ...base, valorDiariaPorPedido: 150, qtdPedidos: 22 });
    expect(t.totalDiarias).toBe(3300);
    expect(t.final).toBe(3300);
  });

  it('composição completa: saldo + salário + diárias + ajustes - adiantamentos', () => {
    const t = calcularTotaisAcerto({
      salarioFixo: 2000,
      valorDiariaPorPedido: 100,
      qtdPedidos: 10,
      ajustes: [
        { tipo: 'bonus', valor: 300 },
        { tipo: 'reembolso', valor: 50 },
        { tipo: 'desconto', valor: 200 },
      ],
      valoresAdiantamentos: [500, 250],
      saldoAnterior: -100, // devia do mês anterior
    });
    expect(t.salarioFixo).toBe(2000);
    expect(t.totalDiarias).toBe(1000);
    expect(t.ajustes).toBe(150);        // +300 +50 -200
    expect(t.adiantamentos).toBe(750);
    expect(t.final).toBe(-100 + 2000 + 1000 + 150 - 750); // 2300
  });

  it('motorista sem configuração (salário/diária null) → tudo zero, sem NaN', () => {
    const t = calcularTotaisAcerto({
      ...base,
      salarioFixo: null,
      valorDiariaPorPedido: undefined,
      qtdPedidos: 15,
      valoresAdiantamentos: [null, undefined],
      saldoAnterior: null,
    });
    expect(t).toEqual({
      salarioFixo: 0, valorDiaria: 0, qtdPedidos: 15, totalDiarias: 0,
      ajustes: 0, adiantamentos: 0, final: 0,
    });
  });

  it('zero pedidos no mês → só salário fixo e saldo anterior', () => {
    const t = calcularTotaisAcerto({
      ...base, salarioFixo: 1800, valorDiariaPorPedido: 120, qtdPedidos: 0, saldoAnterior: 50,
    });
    expect(t.totalDiarias).toBe(0);
    expect(t.final).toBe(1850);
  });

  it('tipo de ajuste desconhecido subtrai (comportamento da tela: só bonus/reembolso somam)', () => {
    const t = calcularTotaisAcerto({
      ...base,
      ajustes: [{ tipo: 'multa', valor: 80 }, { tipo: 'desconto', valor: 20 }],
    });
    expect(t.ajustes).toBe(-100);
    expect(t.final).toBe(-100);
  });

  it('valores vindos como string do banco (numeric) são normalizados', () => {
    const t = calcularTotaisAcerto({
      ...base,
      salarioFixo: '1500.50',
      valorDiariaPorPedido: '100',
      qtdPedidos: 2,
      ajustes: [{ tipo: 'bonus', valor: '99.50' }],
      valoresAdiantamentos: ['300'],
      saldoAnterior: '0',
    });
    expect(t.final).toBe(1500.5 + 200 + 99.5 - 300); // 1500
  });

  it('adiantamento maior que o ganho → final negativo (vira dívida no saldo)', () => {
    const t = calcularTotaisAcerto({
      ...base, valorDiariaPorPedido: 100, qtdPedidos: 3, valoresAdiantamentos: [1000],
    });
    expect(t.final).toBe(-700);
  });
});

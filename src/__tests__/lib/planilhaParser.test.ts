import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilha, detectarMapeamento, montarLinhas, parseValorBR } from "@/lib/import/planilhaParser";

/** Gera um ArrayBuffer de planilha xlsx em memória a partir de uma matriz */
function planilhaDe(matriz: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(matriz);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("lerPlanilha", () => {
  it("lê cabeçalho e linhas, ignorando linhas totalmente vazias", () => {
    const buf = planilhaDe([
      ["Cliente", "Endereço", "Valor"],
      ["Mercado A", "Rua X, 1, Campinas - SP", "100,50"],
      ["", "", ""],
      ["Padaria B", "Av. Y, 22, Itu - SP", "200"],
    ]);
    const p = lerPlanilha(buf);
    expect(p.headers).toEqual(["Cliente", "Endereço", "Valor"]);
    expect(p.linhas).toHaveLength(2);
    expect(p.linhas[0][0]).toBe("Mercado A");
  });

  it("lança erro amigável para planilha vazia", () => {
    expect(() => lerPlanilha(planilhaDe([[""]]))).toThrow(/vazia/i);
  });
});

describe("detectarMapeamento", () => {
  it("detecta colunas pelos nomes em PT-BR (com acento e variações)", () => {
    const m = detectarMapeamento(["Destinatário", "Endereço de Entrega", "Valor Total", "Nº da Nota", "Observações"]);
    expect(m.nome).toBe(0);
    expect(m.endereco).toBe(1);
    expect(m.valor).toBe(2);
    expect(m.numeroNota).toBe(3);
    expect(m.observacoes).toBe(4);
  });

  it("não inventa mapeamento quando os cabeçalhos não casam", () => {
    const m = detectarMapeamento(["Foo", "Bar"]);
    expect(m.endereco).toBeUndefined();
  });
});

describe("parseValorBR", () => {
  it("aceita formatos BR e internacional", () => {
    expect(parseValorBR("1.234,56")).toBe(1234.56);
    expect(parseValorBR("R$ 1.234,56")).toBe(1234.56);
    expect(parseValorBR("1234.56")).toBe(1234.56);
    expect(parseValorBR("200")).toBe(200);
    expect(parseValorBR("")).toBeNull();
    expect(parseValorBR("abc")).toBeNull();
  });
});

describe("montarLinhas", () => {
  it("endereço vazio vira falha com número da linha como no Excel; lote continua", () => {
    const planilha = {
      headers: ["Cliente", "Endereço", "Valor"],
      linhas: [
        ["Mercado A", "Rua X, 1", "100,50"],
        ["Sem Endereço", "", "50"],
        ["Padaria B", "Av. Y, 22", ""],
      ],
    };
    const r = montarLinhas(planilha, { endereco: 1, nome: 0, valor: 2 });
    expect(r.linhas).toHaveLength(2);
    expect(r.falhas).toEqual([{ linha: 3, motivo: "Endereço vazio" }]);
    expect(r.linhas[0]).toMatchObject({ nome: "Mercado A", endereco: "Rua X, 1", valor: 100.5 });
    expect(r.linhas[1].valor).toBeNull();
  });
});

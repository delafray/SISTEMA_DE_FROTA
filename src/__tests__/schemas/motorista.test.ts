import { describe, it, expect } from "vitest";
import { motoristaSchema } from "@/lib/schemas/motorista";

const base = {
  nome: "JOÃO DA SILVA",
  cpf: "12345678901",
  whatsapp: "5531999990000",
  cnh_numero: "12345678901",
  cnh_categoria: "E" as const,
  cnh_validade: "2028-12-31",
};

describe("motoristaSchema", () => {
  it("valida motorista básico", () => {
    expect(motoristaSchema.safeParse(base).success).toBe(true);
  });

  it("rejeita nome curto", () => {
    expect(motoristaSchema.safeParse({ ...base, nome: "AB" }).success).toBe(false);
  });

  it("rejeita CPF curto", () => {
    expect(motoristaSchema.safeParse({ ...base, cpf: "1234" }).success).toBe(false);
  });

  it("rejeita whatsapp sem DDI (menos de 12 dígitos)", () => {
    expect(motoristaSchema.safeParse({ ...base, whatsapp: "31999990000" }).success).toBe(false);
  });

  it("aceita todas as categorias válidas de CNH", () => {
    const categorias = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];
    categorias.forEach((cat) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(motoristaSchema.safeParse({ ...base, cnh_categoria: cat as any }).success).toBe(true);
    });
  });

  it("rejeita categoria de CNH inválida", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(motoristaSchema.safeParse({ ...base, cnh_categoria: "F" as any }).success).toBe(false);
  });

  it("aceita salario_fixo e valor_diaria_por_pedido (modelo SALÁRIO + DIÁRIA)", () => {
    const result = motoristaSchema.safeParse({
      ...base,
      salario_fixo: 2500,
      valor_diaria_por_pedido: 150,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita valor_diaria_por_pedido negativo", () => {
    expect(
      motoristaSchema.safeParse({ ...base, valor_diaria_por_pedido: -10 }).success
    ).toBe(false);
  });

  it("rejeita salario_fixo negativo", () => {
    expect(motoristaSchema.safeParse({ ...base, salario_fixo: -1 }).success).toBe(false);
  });
});

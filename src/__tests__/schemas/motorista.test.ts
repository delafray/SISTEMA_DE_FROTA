import { describe, it, expect } from "vitest";
import { motoristaSchema } from "@/lib/schemas/motorista";

const base = {
  nome: "JOÃO DA SILVA",
  cpf: "12345678901",
  whatsapp: "5531999990000",
  cnh_numero: "12345678901",
  cnh_categoria: "E" as const,
  cnh_validade: "2028-12-31",
  tipo_comissao: "percentual_frete" as const,
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

  it("aceita tipo_comissao valor_fixo_viagem (nome correto do banco)", () => {
    expect(motoristaSchema.safeParse({ ...base, tipo_comissao: "valor_fixo_viagem" }).success).toBe(true);
  });

  it("rejeita tipo_comissao inválido", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(motoristaSchema.safeParse({ ...base, tipo_comissao: "fixo_por_viagem" as any }).success).toBe(false);
  });
});

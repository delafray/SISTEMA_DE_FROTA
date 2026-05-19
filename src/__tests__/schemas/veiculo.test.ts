import { describe, it, expect } from "vitest";
import { veiculoSchema } from "@/lib/schemas/veiculo";

const base = {
  placa: "ABC1234",
  marca: "VOLVO",
  modelo: "FH 540",
  ano: 2022,
  chassi: "9BM384075MB123456",
  renavam: "12345678901",
  combustivel: "diesel" as const,
  tipo: "caminhao" as const,
};

describe("veiculoSchema", () => {
  it("valida veículo básico", () => {
    expect(veiculoSchema.safeParse(base).success).toBe(true);
  });

  it("valida placa mercosul", () => {
    expect(veiculoSchema.safeParse({ ...base, placa: "ABC1D23" }).success).toBe(true);
  });

  it("rejeita placa inválida", () => {
    expect(veiculoSchema.safeParse({ ...base, placa: "INVALID" }).success).toBe(false);
  });

  it("rejeita chassi com comprimento diferente de 17", () => {
    expect(veiculoSchema.safeParse({ ...base, chassi: "ABC123" }).success).toBe(false);
  });

  it("rejeita ano antes de 1990 (constraint do banco)", () => {
    expect(veiculoSchema.safeParse({ ...base, ano: 1985 }).success).toBe(false);
  });

  it("aceita combustivel diesel_s10 (existe no banco)", () => {
    expect(veiculoSchema.safeParse({ ...base, combustivel: "diesel_s10" }).success).toBe(true);
  });

  it("rejeita combustivel gnv (não existe no banco)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(veiculoSchema.safeParse({ ...base, combustivel: "gnv" as any }).success).toBe(false);
  });

  it("rejeita tipo carreta (é categoria no banco, não tipo)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(veiculoSchema.safeParse({ ...base, tipo: "carreta" as any }).success).toBe(false);
  });

  it("aceita categoria carreta (separada de tipo)", () => {
    expect(veiculoSchema.safeParse({ ...base, categoria: "carreta" }).success).toBe(true);
  });

  it("valida campos opcionais de manutenção", () => {
    expect(veiculoSchema.safeParse({
      ...base,
      km_atual: 150000,
      ipva_vencimento: "2026-01-15",
      seguradora: "PORTO SEGURO",
    }).success).toBe(true);
  });
});

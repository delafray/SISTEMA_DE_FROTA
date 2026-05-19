import { describe, it, expect } from "vitest";
import { clienteSchema } from "@/lib/schemas/cliente";

const base = {
  nome_fantasia: "CLIENTE TESTE",
  documento: "12345678000199",
  tipo_pessoa: "juridica" as const,
};

describe("clienteSchema", () => {
  it("valida cliente juridico básico", () => {
    expect(clienteSchema.safeParse(base).success).toBe(true);
  });

  it("valida cliente fisico", () => {
    expect(clienteSchema.safeParse({ ...base, documento: "12345678901", tipo_pessoa: "fisica" }).success).toBe(true);
  });

  it("rejeita sem nome_fantasia", () => {
    expect(clienteSchema.safeParse({ ...base, nome_fantasia: "" }).success).toBe(false);
  });

  it("rejeita sem documento", () => {
    expect(clienteSchema.safeParse({ ...base, documento: "123" }).success).toBe(false);
  });

  it("aceita email válido", () => {
    expect(clienteSchema.safeParse({ ...base, email: "contato@empresa.com.br" }).success).toBe(true);
  });

  it("rejeita email inválido", () => {
    expect(clienteSchema.safeParse({ ...base, email: "nao-e-email" }).success).toBe(false);
  });

  it("aceita forma_pagamento_padrao válida", () => {
    expect(clienteSchema.safeParse({ ...base, forma_pagamento_padrao: "30d" }).success).toBe(true);
  });

  it("rejeita forma_pagamento_padrao inválida", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(clienteSchema.safeParse({ ...base, forma_pagamento_padrao: "prazo_30" as any }).success).toBe(false);
  });
});

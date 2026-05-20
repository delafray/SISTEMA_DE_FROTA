import { describe, it, expect } from "vitest";
import { normalizar } from "@/lib/utils/normalizar";

describe("normalizar", () => {
  it("remove acentos", () => {
    expect(normalizar("São Paulo")).toBe("sao paulo");
    expect(normalizar("AÇÚCAR")).toBe("acucar");
    expect(normalizar("coração")).toBe("coracao");
  });

  it("converte para minúsculas", () => {
    expect(normalizar("ABCDEF")).toBe("abcdef");
  });

  it("remove espaços nas pontas", () => {
    expect(normalizar("  texto  ")).toBe("texto");
  });

  it("preserva espaços internos", () => {
    expect(normalizar("Belo Horizonte MG")).toBe("belo horizonte mg");
  });

  it("trata string vazia", () => {
    expect(normalizar("")).toBe("");
  });

  it("trata null/undefined sem quebrar", () => {
    expect(normalizar(null as unknown as string)).toBe("");
    expect(normalizar(undefined as unknown as string)).toBe("");
  });

  it("normaliza nomes de motoristas comuns", () => {
    expect(normalizar("João da Silva")).toBe("joao da silva");
    expect(normalizar("Antônio Carlos")).toBe("antonio carlos");
    expect(normalizar("Maíra Müller")).toBe("maira muller");
  });

  it("normaliza placas (não afeta letras/números)", () => {
    expect(normalizar("ABC-1234")).toBe("abc-1234");
    expect(normalizar("ABC1D23")).toBe("abc1d23");
  });

  it("é idempotente (aplicar 2x dá o mesmo resultado)", () => {
    const entrada = "  São Paulo - SP  ";
    expect(normalizar(normalizar(entrada))).toBe(normalizar(entrada));
  });

  it("permite busca accent-insensitive", () => {
    const haystack = normalizar("Antônio José da Conceição");
    const needle = normalizar("antonio");
    expect(haystack.includes(needle)).toBe(true);
  });
});

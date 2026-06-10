import { describe, it, expect } from "vitest";
import { parseDestinoEstruturado } from "@/lib/routing/geocodarEntregasPedido";

describe("parseDestinoEstruturado", () => {
  it("estrutura o formato completo gerado pela importação de NFe", () => {
    expect(parseDestinoEstruturado("Rua das Flores, 123, Centro, Campinas - SP, CEP 13010-000")).toEqual({
      logradouro: "Rua das Flores",
      numero: "123",
      bairro: "Centro",
      cidade: "Campinas",
      uf: "SP",
      cep: "13010000",
    });
  });

  it("estrutura sem número e sem bairro (NFe com nro SN)", () => {
    expect(parseDestinoEstruturado("Estrada Velha, Itu - SP")).toEqual({
      logradouro: "Estrada Velha",
      numero: undefined,
      bairro: undefined,
      cidade: "Itu",
      uf: "SP",
      cep: undefined,
    });
  });

  it("junta múltiplas partes de bairro e aceita CEP sem prefixo", () => {
    const r = parseDestinoEstruturado("Av. Brasil, 1000, Jardim América, Zona Sul, Rio de Janeiro - RJ, 20040-002");
    expect(r).toMatchObject({
      logradouro: "Av. Brasil",
      numero: "1000",
      bairro: "Jardim América, Zona Sul",
      cidade: "Rio de Janeiro",
      uf: "RJ",
      cep: "20040002",
    });
  });

  it("aceita cidade composta com apóstrofo", () => {
    const r = parseDestinoEstruturado("Rua A, 5, Santa Bárbara d'Oeste - SP");
    expect(r).toMatchObject({ cidade: "Santa Bárbara d'Oeste", uf: "SP", numero: "5" });
  });

  it("recusa texto sem 'Cidade - UF' (cai no caminho texto-livre)", () => {
    expect(parseDestinoEstruturado("Rua X, 123")).toBeNull();
    expect(parseDestinoEstruturado("Avenida Brasil 1000 São Paulo")).toBeNull();
    expect(parseDestinoEstruturado("")).toBeNull();
  });

  it("recusa quando 'Cidade - UF' seria o logradouro (primeira parte)", () => {
    expect(parseDestinoEstruturado("Campinas - SP, 123")).toBeNull();
  });
});

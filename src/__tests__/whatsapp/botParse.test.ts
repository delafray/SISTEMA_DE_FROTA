import { describe, it, expect } from "vitest";
import { parseSimNao, parseSelecao, ehReset, comecaComGatilho } from "@/lib/whatsapp/botParse";

describe("comecaComGatilho", () => {
  const g = ["lembrete", "me lembra", "anota"];
  it("dispara quando começa com o gatilho", () => {
    expect(comecaComGatilho("lembrete comprar pneu", g)).toBe(true);
    expect(comecaComGatilho("Lembrete: comprar pneu", g)).toBe(true);
    expect(comecaComGatilho("me lembra de ligar", g)).toBe(true);
    expect(comecaComGatilho("lembrete", g)).toBe(true);
  });
  it("NÃO dispara quando o gatilho não é a primeira palavra", () => {
    expect(comecaComGatilho("preciso de um lembrete", g)).toBe(false);
    expect(comecaComGatilho("qual o km do leão", g)).toBe(false);
    expect(comecaComGatilho("comprar pneu", g)).toBe(false);
  });
});

describe("ehReset", () => {
  it("reconhece pedidos de limpar contexto", () => {
    for (const s of ["novo", "Nova", "limpar", "LIMPAR", "recomeçar", "menu", "começar de novo", "do zero"])
      expect(ehReset(s)).toBe(true);
  });
  it("não confunde com mensagem normal", () => {
    for (const s of ["qual o km do leão", "novo caminhão chegou", "sim"])
      expect(ehReset(s)).toBe(false);
  });
});

describe("parseSimNao", () => {
  it("reconhece afirmações", () => {
    for (const s of ["sim", "Sim", "ok", "pode", "confirmo", "isso", "beleza", "vai", "👍", "1"])
      expect(parseSimNao(s)).toBe(true);
  });
  it("reconhece negações", () => {
    for (const s of ["não", "nao", "n", "cancela", "esquece", "errado", "👎"])
      expect(parseSimNao(s)).toBe(false);
  });
  it("ambíguo → null (default seguro: não executa)", () => {
    for (const s of ["talvez", "sei lá", "depois", "uhum?", "o que"])
      expect(parseSimNao(s)).toBeNull();
  });
  it("ignora pontuação e acento", () => {
    expect(parseSimNao("Sim!")).toBe(true);
    expect(parseSimNao("não.")).toBe(false);
  });
});

describe("parseSelecao", () => {
  const ops = ["Status da Frota", "Consultar Manutenções", "Mudar Status do Veículo"];
  it("número escolhe a opção", () => {
    expect(parseSelecao("1", ops)).toBe(0);
    expect(parseSelecao("3", ops)).toBe(2);
  });
  it("número fora do range → null", () => {
    expect(parseSelecao("5", ops)).toBeNull();
    expect(parseSelecao("0", ops)).toBeNull();
  });
  it("'nenhuma'/cancelar → -1", () => {
    expect(parseSelecao("nenhuma", ops)).toBe(-1);
    expect(parseSelecao("cancela", ops)).toBe(-1);
  });
  it("casa por nome (substring, mín 3 chars)", () => {
    expect(parseSelecao("manutenções", ops)).toBe(1);
    expect(parseSelecao("status", ops)).toBe(0);
  });
  it("não entendeu → null", () => {
    expect(parseSelecao("xyz qualquer coisa", ops)).toBeNull();
  });
});

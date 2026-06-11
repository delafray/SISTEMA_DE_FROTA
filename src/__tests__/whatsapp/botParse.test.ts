import { describe, it, expect } from "vitest";
import { parseSimNao, parseSelecao, ehReset, comecaComGatilho, limparLembrete, ehReferenciaGenerica, parseStatusVeiculo } from "@/lib/whatsapp/botParse";

describe("ehReferenciaGenerica", () => {
  it("reconhece referência ao caminhão do contexto", () => {
    for (const s of ["esse caminhão", "este caminhão", "ele", "o caminhão", "esse", "aquele caminhão"])
      expect(ehReferenciaGenerica(s)).toBe(true);
  });
  it("apelido/placa real NÃO é genérico", () => {
    for (const s of ["leão", "ABC0001", "trovão"])
      expect(ehReferenciaGenerica(s)).toBe(false);
  });
});

describe("limparLembrete", () => {
  it("remove o prefixo-gatilho e mantém o conteúdo", () => {
    expect(limparLembrete("lembrete colocar o caminhão em manutenção")).toBe("colocar o caminhão em manutenção");
    expect(limparLembrete("anota: comprar pneu")).toBe("comprar pneu");
    expect(limparLembrete("me lembra de pagar o frentista")).toBe("pagar o frentista");
  });
  it("sem prefixo → mantém o texto inteiro", () => {
    expect(limparLembrete("pagar o frentista amanhã")).toBe("pagar o frentista amanhã");
  });
  it("só o gatilho (sem conteúdo) → mantém original", () => {
    expect(limparLembrete("lembrete")).toBe("lembrete");
  });
});

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
  it("aceita a 1ª palavra (sim/não com complemento)", () => {
    expect(parseSimNao("sim, pode anotar")).toBe(true);
    expect(parseSimNao("não quero")).toBe(false);
  });
  it("frase nova (sem sim/não) → null (abandona a pergunta)", () => {
    expect(parseSimNao("pagar o frentista amanhã")).toBeNull();
    expect(parseSimNao("lembrete comprar pneu")).toBeNull();
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
  it("aceita ordinais (primeiro/segundo/último)", () => {
    expect(parseSelecao("primeiro", ops)).toBe(0);
    expect(parseSelecao("o segundo", ops)).toBe(1);
    expect(parseSelecao("último", ops)).toBe(2);
  });
  it("não entendeu → null", () => {
    expect(parseSelecao("xyz qualquer coisa", ops)).toBeNull();
  });
});


describe("parseStatusVeiculo", () => {
  it("manutenção: oficina/mecânico/conserto", () => {
    expect(parseStatusVeiculo("coloca o leão em manutenção")).toBe("manutencao");
    expect(parseStatusVeiculo("manda o touro pra oficina")).toBe("manutencao");
    expect(parseStatusVeiculo("o tigre vai pro mecânico")).toBe("manutencao");
  });
  it("parado: encostar/tirar de circulação/garagem", () => {
    expect(parseStatusVeiculo("deixa o leão parado")).toBe("parado");
    expect(parseStatusVeiculo("encosta o touro")).toBe("parado");
    expect(parseStatusVeiculo("tira o ABC1234 de circulação")).toBe("parado");
  });
  it("operacional: rodar/liberar (caller orienta pro painel)", () => {
    expect(parseStatusVeiculo("põe o leão pra rodar")).toBe("operacional");
    expect(parseStatusVeiculo("libera o touro")).toBe("operacional");
  });
  it("não deu pra saber → null", () => {
    expect(parseStatusVeiculo("muda o status do leão")).toBeNull();
    expect(parseStatusVeiculo("e aí, tudo certo?")).toBeNull();
  });
});

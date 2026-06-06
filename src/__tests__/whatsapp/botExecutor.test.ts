import { describe, it, expect } from "vitest";
import { colunasPermitidas, tabelaDaAcao, commitAtualizarKm, type EscopoColunas } from "@/lib/whatsapp/botExecutor";

const escopo: EscopoColunas = {
  veiculos: { placa: ["consultar"], apelido: ["consultar"], km_atual: ["consultar", "alterar"] },
  alocacoes: { status: ["alterar"] },
};

describe("allowlist de colunas", () => {
  it("colunasPermitidas filtra por ação", () => {
    expect(colunasPermitidas(escopo, "veiculos", "consultar").sort()).toEqual(["apelido", "km_atual", "placa"]);
    expect(colunasPermitidas(escopo, "veiculos", "alterar")).toEqual(["km_atual"]);
    expect(colunasPermitidas(escopo, "alocacoes", "consultar")).toEqual([]);
  });
  it("tabela inexistente → vazio", () => {
    expect(colunasPermitidas(escopo, "perfis", "consultar")).toEqual([]);
  });
  it("rejeita identificador inválido (defesa contra injection)", () => {
    const ruim: EscopoColunas = { veiculos: { "km; drop table": ["consultar"] } };
    expect(colunasPermitidas(ruim, "veiculos", "consultar")).toEqual([]);
  });
  it("tabelaDaAcao acha a 1ª tabela com a ação", () => {
    expect(tabelaDaAcao(escopo, "alterar")).toBe("veiculos");
    expect(tabelaDaAcao(escopo, "consultar")).toBe("veiculos");
    expect(tabelaDaAcao(escopo, "registrar")).toBeNull();
  });
});

describe("commitAtualizarKm — validação km não decresce", () => {
  // mock mínimo do supabase client: veículo atual com km 150000
  const fakeSb = (kmAtual: number) => ({
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { km_atual: kmAtual, updated_at: "2026-06-05T00:00:00Z", apelido: "leão" }, error: null }); },
        update() { return { eq() { return this; }, select: () => Promise.resolve({ data: [{ id: "v1" }], error: null }) }; },
      };
    },
  });

  it("recusa km menor ou igual ao atual", async () => {
    // @ts-expect-error mock parcial
    const r = await commitAtualizarKm(fakeSb(150000), { empresa_id: "e1" }, "v1", 140000, 150000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/maior|aumenta/i);
  });

  it("recusa sem referência de lock (km da proposta nulo)", async () => {
    // @ts-expect-error mock parcial
    const r = await commitAtualizarKm(fakeSb(150000), { empresa_id: "e1" }, "v1", 160000, null);
    expect(r.ok).toBe(false);
  });

  it("aceita km maior (com lock por valor)", async () => {
    // @ts-expect-error mock parcial
    const r = await commitAtualizarKm(fakeSb(150000), { empresa_id: "e1" }, "v1", 160000, 150000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.km).toBe(160000);
  });
});

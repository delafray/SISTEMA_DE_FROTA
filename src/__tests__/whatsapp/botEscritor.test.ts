import { describe, it, expect } from "vitest";
import {
  escritaDaRegra, commitEscritaGenerica, previewEscrita, consultaSoma,
  type EscritaConfig, type EscopoColunas,
} from "@/lib/whatsapp/botExecutor";

const escrita: EscritaConfig = {
  tabela: "lembretes",
  acao: "registrar",
  campos: [
    { campo: "texto", rotulo: "Anotação", tipo: "texto", obrigatorio: true },
    { campo: "origem", tipo: "texto" },
  ],
};
const escopo: EscopoColunas = { lembretes: { texto: ["registrar"], origem: ["registrar"] } };

function fakeInsert(capturado: { linha?: Record<string, unknown> }, erro: string | null = null) {
  return {
    from() {
      return {
        insert(l: Record<string, unknown>) {
          capturado.linha = l;
          return Promise.resolve({ error: erro ? { message: erro } : null });
        },
        select() { return this; }, eq() { return this; }, gte() { return this; },
      };
    },
  } as never;
}

describe("escritaDaRegra — validação do shape", () => {
  it("aceita config válida", () => {
    expect(escritaDaRegra({ escrita })).not.toBeNull();
  });
  it("rejeita sem escrita / ação errada / tabela inválida / campos vazios", () => {
    expect(escritaDaRegra({})).toBeNull();
    expect(escritaDaRegra({ escrita: { ...escrita, acao: "alterar" } })).toBeNull();
    expect(escritaDaRegra({ escrita: { ...escrita, tabela: "lembretes; drop" } })).toBeNull();
    expect(escritaDaRegra({ escrita: { ...escrita, campos: [] } })).toBeNull();
  });
  it("rejeita campo com identificador malicioso", () => {
    expect(escritaDaRegra({ escrita: { ...escrita, campos: [{ campo: "x--", tipo: "texto" }] } })).toBeNull();
  });
});

describe("commitEscritaGenerica — allowlist e obrigatórios", () => {
  it("grava só campos permitidos + empresa_id", async () => {
    const cap: { linha?: Record<string, unknown> } = {};
    const r = await commitEscritaGenerica(fakeInsert(cap), { empresa_id: "e1" }, escrita, escopo, { texto: "comprar pneu", origem: "bot" });
    expect(r.ok).toBe(true);
    expect(cap.linha).toEqual({ texto: "comprar pneu", origem: "bot", empresa_id: "e1" });
  });
  it("recusa obrigatório faltando", async () => {
    const r = await commitEscritaGenerica(fakeInsert({}), { empresa_id: "e1" }, escrita, escopo, { texto: null, origem: "bot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Anotação/);
  });
  it("recusa campo fora da allowlist (matriz sem Inclui)", async () => {
    const escopoSemOrigem: EscopoColunas = { lembretes: { texto: ["registrar"] } };
    const r = await commitEscritaGenerica(fakeInsert({}), { empresa_id: "e1" }, escrita, escopoSemOrigem, { texto: "x", origem: "bot" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/origem/);
  });
  it("valida tipo número e data", async () => {
    const e2: EscritaConfig = { tabela: "t", acao: "registrar", sem_empresa_id: true, campos: [{ campo: "valor", tipo: "numero", obrigatorio: true }] };
    const esc2: EscopoColunas = { t: { valor: ["registrar"] } };
    const ruim = await commitEscritaGenerica(fakeInsert({}), { empresa_id: "e1" }, e2, esc2, { valor: "abc" as unknown as number });
    expect(ruim.ok).toBe(false);
  });
  it("sem_empresa_id não injeta empresa", async () => {
    const cap: { linha?: Record<string, unknown> } = {};
    const e2: EscritaConfig = { ...escrita, sem_empresa_id: true };
    await commitEscritaGenerica(fakeInsert(cap), { empresa_id: "e1" }, e2, escopo, { texto: "x", origem: null });
    expect(cap.linha).toEqual({ texto: "x" });
  });
});

describe("previewEscrita", () => {
  it("monta linhas com rótulo e data dd/mm/aaaa", () => {
    const e2: EscritaConfig = {
      tabela: "folgas", acao: "registrar",
      campos: [{ campo: "motorista", rotulo: "Motorista", tipo: "texto" }, { campo: "data", rotulo: "Dia", tipo: "data" }],
    };
    const p = previewEscrita(e2, { motorista: "Zé", data: "2026-06-14" });
    expect(p).toContain("• Motorista: Zé");
    expect(p).toContain("• Dia: 14/06/2026");
  });
});

describe("consultaSoma", () => {
  it("soma a coluna e formata em R$", async () => {
    const sb = {
      from() {
        const b = {
          select() { return b; }, eq() { return b; }, gte() { return b; },
          then(res: (v: unknown) => unknown) { return Promise.resolve({ data: [{ valor_total: 500 }, { valor_total: 340.5 }], error: null }).then(res); },
        };
        return b;
      },
    } as never;
    const r = await consultaSoma(sb, { abastecimentos: { valor_total: ["consultar"] } }, { empresa_id: "e1" }, { coluna: "valor_total", periodo: "mes" });
    expect(r).toContain("840,50");
    expect(r).toMatch(/no mês/);
    expect(r).toMatch(/2 lançamentos/);
  });
});

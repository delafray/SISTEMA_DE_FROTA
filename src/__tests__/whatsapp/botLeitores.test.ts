import { describe, it, expect } from "vitest";
import {
  andamentoRotas, resumoDia, entregasDia, pedidosAbertos,
  vencimentos, ondeEsta, meusLembretes, LEITORES_GESTOR,
} from "@/lib/whatsapp/botLeitores";

const EMP = "empresa-teste";
const CTX = { empresa_id: EMP };

// ─── Fábrica de mock do Supabase ─────────────────────────────────────────────
// Cada chamada .from() pode devolver dados diferentes; passamos um mapa de tabela → dados.
type FakeData = Record<string, unknown[]>;

function makeSb(tabelas: FakeData = {}) {
  const make = (tabela: string) => {
    const rows = tabelas[tabela] ?? [];
    const q: Record<string, unknown> = {
      select() { return q; },
      eq() { return q; },
      neq() { return q; },
      gte() { return q; },
      lt() { return q; },
      in() { return q; },
      is() { return q; },
      not() { return q; },
      or() { return q; },
      order() { return q; },
      limit() { return q; },
      filter() { return q; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
      },
      // permite await diretamente
      [Symbol.toStringTag]: "PostgrestBuilder",
    };
    // tornar o builder thenable (await q retorna { data, error, count })
    Object.defineProperty(q, "then", {
      value(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
      },
    });
    return q;
  };

  return { from: (tabela: string) => make(tabela) };
}

// ─── andamentoRotas ──────────────────────────────────────────────────────────

describe("andamentoRotas", () => {
  it("sem rotas → mensagem vazia", async () => {
    // @ts-expect-error mock parcial
    const r = await andamentoRotas(makeSb(), CTX);
    expect(r).toMatch(/nenhuma rota/i);
  });

  it("com rotas → lista motoristas e paradas", async () => {
    const sb = makeSb({
      rotas_otimizadas: [{ id: "r1", status: "em_andamento", motorista_id: "m1", distancia_total_km: 120, tempo_total_min: 90 }],
      motoristas: [{ id: "m1", nome: "João Silva" }],
      paradas: [
        { rota_id: "r1", concluida_em: "2026-06-11T10:00:00Z" },
        { rota_id: "r1", concluida_em: null },
        { rota_id: "r1", concluida_em: null },
      ],
    });
    // @ts-expect-error mock parcial
    const r = await andamentoRotas(sb, CTX);
    expect(r).toMatch(/João Silva/);
    expect(r).toMatch(/1\/3 paradas/);
    expect(r).toMatch(/120/); // km
  });
});

// ─── resumoDia ───────────────────────────────────────────────────────────────

describe("resumoDia", () => {
  it("frota vazia → resumo com zeros", async () => {
    // @ts-expect-error mock parcial
    const r = await resumoDia(makeSb(), CTX);
    expect(r).toMatch(/resumo/i);
    expect(r).toMatch(/0 rodando/i);
  });

  it("frota com veículos e entregas", async () => {
    const sb = makeSb({
      veiculos: [{ id: "v1" }, { id: "v2" }],
      alocacoes: [{ veiculo_id: "v1", status: "operacional" }],
      entregas: [{ status: "concluida" }, { status: "pendente" }],
      pedidos: [],
      avarias: [],
      abastecimentos: [{ litros: 80, valor_total: 480 }],
    });
    // @ts-expect-error mock parcial
    const r = await resumoDia(sb, CTX);
    expect(r).toMatch(/1 rodando/i);
    expect(r).toMatch(/80/); // litros
  });
});

// ─── entregasDia ─────────────────────────────────────────────────────────────

describe("entregasDia", () => {
  it("sem entregas → mensagem vazia", async () => {
    // @ts-expect-error mock parcial
    const r = await entregasDia(makeSb(), CTX);
    expect(r).toMatch(/nenhuma entrega/i);
  });

  it("com entregas pendentes e concluídas", async () => {
    const sb = makeSb({
      entregas: [
        { id: "e1", status: "concluida", destino: "Rua A", nome_cliente_avulso: "Cliente X", data_entrega_prevista: "2026-06-11" },
        { id: "e2", status: "pendente", destino: "Rua B", nome_cliente_avulso: "Cliente Y", data_entrega_prevista: "2026-06-11" },
      ],
    });
    // @ts-expect-error mock parcial
    const r = await entregasDia(sb, CTX);
    expect(r).toMatch(/1× concluida/i);
    expect(r).toMatch(/1× pendente/i);
    expect(r).toMatch(/Cliente Y/);
  });

  it("todas concluídas → sem lista de pendentes", async () => {
    const sb = makeSb({
      entregas: [
        { id: "e1", status: "concluida", destino: "Rua A", nome_cliente_avulso: null, data_entrega_prevista: "2026-06-11" },
      ],
    });
    // @ts-expect-error mock parcial
    const r = await entregasDia(sb, CTX);
    expect(r).toMatch(/todas concluídas/i);
  });
});

// ─── pedidosAbertos ──────────────────────────────────────────────────────────

describe("pedidosAbertos", () => {
  it("sem pedidos → mensagem comemorativa", async () => {
    // @ts-expect-error mock parcial
    const r = await pedidosAbertos(makeSb(), CTX);
    expect(r).toMatch(/nenhum pedido em aberto/i);
  });

  it("com pedidos → lista número e status", async () => {
    const sb = makeSb({
      pedidos: [
        { id: "p1", numero: "2026/001", status: "em_andamento", cliente_id: "c1", created_at: "2026-06-11T08:00:00Z" },
        { id: "p2", numero: null, status: "pendente", cliente_id: null, created_at: "2026-06-11T07:00:00Z" },
      ],
      clientes: [{ id: "c1", nome_fantasia: "Transportes ABC" }],
    });
    // @ts-expect-error mock parcial
    const r = await pedidosAbertos(sb, CTX);
    expect(r).toMatch(/#2026\/001/);
    expect(r).toMatch(/Transportes ABC/);
    expect(r).toMatch(/avulso/i);
  });
});

// ─── vencimentos ─────────────────────────────────────────────────────────────

describe("vencimentos", () => {
  it("sem vencimentos próximos → tudo em dia", async () => {
    const sb = makeSb({
      veiculos: [{ id: "v1", apelido: "leão", placa: "ABC1D23", ipva_vencimento: "2027-01-01", licenciamento_vencimento: null, seguro_vencimento: null, data_proxima_revisao: null, km_proxima_revisao: null, km_atual: null }],
      motoristas: [{ id: "m1", nome: "João", cnh_validade: "2027-06-30" }],
    });
    // @ts-expect-error mock parcial
    const r = await vencimentos(sb, CTX);
    expect(r).toMatch(/nenhum vencimento/i);
  });

  it("vencimento próximo → aparece na lista", async () => {
    const proximos = new Date();
    proximos.setDate(proximos.getDate() + 5);
    const vencData = proximos.toISOString().slice(0, 10);
    const sb = makeSb({
      veiculos: [{ id: "v1", apelido: "leão", placa: "ABC1D23", ipva_vencimento: vencData, licenciamento_vencimento: null, seguro_vencimento: null, data_proxima_revisao: null, km_proxima_revisao: null, km_atual: null }],
      motoristas: [],
    });
    // @ts-expect-error mock parcial
    const r = await vencimentos(sb, CTX);
    expect(r).toMatch(/leão/);
    expect(r).toMatch(/IPVA/);
  });

  it("km de revisão ultrapassado → aparece como urgente", async () => {
    const sb = makeSb({
      veiculos: [{ id: "v1", apelido: "touro", placa: "XYZ9A99", ipva_vencimento: null, licenciamento_vencimento: null, seguro_vencimento: null, data_proxima_revisao: null, km_proxima_revisao: 150000, km_atual: 150500 }],
      motoristas: [],
    });
    // @ts-expect-error mock parcial
    const r = await vencimentos(sb, CTX);
    expect(r).toMatch(/touro/);
    expect(r).toMatch(/Revisão por KM/);
  });
});

// ─── ondeEsta ────────────────────────────────────────────────────────────────

describe("ondeEsta", () => {
  it("sem veículos → mensagem vazia", async () => {
    // @ts-expect-error mock parcial
    const r = await ondeEsta(makeSb(), CTX);
    expect(r).toMatch(/nenhum caminhão/i);
  });

  it("com veículo e última entrega", async () => {
    const sb = makeSb({
      veiculos: [{ id: "v1", apelido: "leão", placa: "ABC1D23" }],
      entregas: [
        { veiculo_id: "v1", destino: "Rua das Flores", nome_cliente_avulso: "Padaria Sol", data_fim: "2026-06-11T14:30:00Z", status: "concluida" },
      ],
      alocacoes: [{ veiculo_id: "v1", status: "operacional", motorista_id: "m1" }],
      motoristas: [{ id: "m1", nome: "Carlos" }],
    });
    // @ts-expect-error mock parcial
    const r = await ondeEsta(sb, CTX);
    expect(r).toMatch(/leão/);
    expect(r).toMatch(/Padaria Sol/);
    expect(r).toMatch(/posição aproximada/i);
  });

  it("sem entregas registradas → informa que não há", async () => {
    const sb = makeSb({
      veiculos: [{ id: "v1", apelido: "touro", placa: "XYZ" }],
      entregas: [],
      alocacoes: [],
      motoristas: [],
    });
    // @ts-expect-error mock parcial
    const r = await ondeEsta(sb, CTX);
    expect(r).toMatch(/sem entrega registrada/i);
  });
});

// ─── meusLembretes ───────────────────────────────────────────────────────────

describe("meusLembretes", () => {
  it("sem lembretes → mensagem positiva", async () => {
    // @ts-expect-error mock parcial
    const r = await meusLembretes(makeSb(), CTX);
    expect(r).toMatch(/nenhum lembrete/i);
  });

  it("com lembretes → lista numerada", async () => {
    const sb = makeSb({
      lembretes: [
        { id: "l1", texto: "Ligar pro fornecedor", criado_em: "2026-06-11T09:00:00Z", criado_por_nome: "Dono" },
        { id: "l2", texto: "Renovar seguro do touro", criado_em: "2026-06-10T15:00:00Z", criado_por_nome: null },
      ],
    });
    // @ts-expect-error mock parcial
    const r = await meusLembretes(sb, CTX);
    expect(r).toMatch(/Ligar pro fornecedor/);
    expect(r).toMatch(/Renovar seguro/);
    expect(r).toMatch(/1\./);
    expect(r).toMatch(/2\./);
  });
});

// ─── LEITORES_GESTOR mapa ────────────────────────────────────────────────────

describe("LEITORES_GESTOR", () => {
  it("contém as 7 chaves esperadas", () => {
    const chaves = ["andamentoRotas", "resumoDia", "entregasDia", "pedidosAbertos", "vencimentos", "ondeEsta", "meusLembretes"];
    for (const c of chaves) {
      expect(LEITORES_GESTOR).toHaveProperty(c);
      expect(typeof LEITORES_GESTOR[c]).toBe("function");
    }
  });
});

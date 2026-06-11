import { describe, it, expect } from "vitest";
import {
  andamentoRotas, entregasDia, pedidosAbertos, resumoDia,
  vencimentos, ondeEsta, meusLembretes, avariasVeiculo, manutencoesPeriodicas, LEITORES,
} from "@/lib/whatsapp/botLeitores";

/**
 * Fake do supabase roteado por TABELA: qualquer query em `t` devolve `tabelas[t]`.
 * Filtros não são aplicados (isso é papel do Supabase real) — os testes validam
 * FORMATO da resposta e caminhos vazios, não a filtragem.
 */
function fakeSb(tabelas: Record<string, unknown[]>) {
  return {
    from(t: string) {
      const rows = tabelas[t] ?? [];
      const b: Record<string, unknown> = {
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(res); },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      };
      for (const m of ["select", "eq", "in", "is", "gte", "lt", "not", "order", "limit"]) b[m] = () => b;
      return b;
    },
  } as never;
}

const ctx = { empresa_id: "e1" };
const hojeYmd = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

describe("andamentoRotas (R1)", () => {
  it("sem rota hoje → mensagem clara", async () => {
    const sb = fakeSb({ veiculos: [{ id: "v1", apelido: "Leão", placa: "ABC1234" }], alocacoes: [], rotas_otimizadas: [] });
    expect(await andamentoRotas(sb, ctx, {})).toMatch(/nenhuma rota criada hoje/i);
  });
  it("rota em andamento → X de Y entregas e última hora", async () => {
    const sb = fakeSb({
      veiculos: [{ id: "v1", apelido: "Leão", placa: "ABC1234" }],
      alocacoes: [{ veiculo_id: "v1", status: "operacional", motorista_id: "m1" }],
      rotas_otimizadas: [{ id: "r1", motorista_id: "m1", status: "em_andamento", criada_em: "2026-06-11T08:00:00Z" }],
      paradas: [
        { rota_id: "r1", concluida_em: "2026-06-11T13:15:00Z" },
        { rota_id: "r1", concluida_em: null },
        { rota_id: "r1", concluida_em: null },
      ],
      motoristas: [{ id: "m1", nome: "Zé" }],
    });
    const r = await andamentoRotas(sb, ctx, {});
    expect(r).toContain("Leão");
    expect(r).toContain("Zé");
    expect(r).toMatch(/1 de 3/);
    expect(r).toMatch(/10:15/); // 13:15 UTC = 10:15 local
  });
  it("rota pronta sem sair → AINDA NÃO SAIU", async () => {
    const sb = fakeSb({
      veiculos: [{ id: "v1", apelido: "Touro", placa: null }],
      alocacoes: [{ veiculo_id: "v1", status: "operacional", motorista_id: "m1" }],
      rotas_otimizadas: [{ id: "r1", motorista_id: "m1", status: "otimizada", criada_em: "x" }],
      paradas: [], motoristas: [{ id: "m1", nome: "Carlos" }],
    });
    expect(await andamentoRotas(sb, ctx, {})).toMatch(/AINDA NÃO SAIU/);
  });
  it("caminhão sem motorista vinculado → avisa", async () => {
    const sb = fakeSb({ veiculos: [{ id: "v1", apelido: "Leão", placa: null }], alocacoes: [], rotas_otimizadas: [] });
    expect(await andamentoRotas(sb, ctx, { veiculoId: "v1" })).toMatch(/sem motorista/i);
  });
});

describe("entregasDia (R2)", () => {
  it("nada hoje → mensagem clara", async () => {
    const sb = fakeSb({ entregas: [] });
    expect(await entregasDia(sb, ctx, {})).toMatch(/sem entregas hoje/i);
  });
  it("pendentes listadas com cliente", async () => {
    const sb = fakeSb({
      entregas: [{ id: "1", cliente_id: "c1", nome_cliente_avulso: null, destino: "Rua X", status: "agendada" }],
      clientes: [{ id: "c1", nome_fantasia: "Mercadão" }],
    });
    const r = await entregasDia(sb, ctx, {});
    expect(r).toContain("Mercadão");
    expect(r).toMatch(/pendentes/);
  });
});

describe("pedidosAbertos (R3)", () => {
  it("nenhum aberto → ✅", async () => {
    const sb = fakeSb({ pedidos: [] });
    expect(await pedidosAbertos(sb, ctx, {})).toMatch(/nenhum pedido/i);
  });
  it("lista número e cliente", async () => {
    const sb = fakeSb({
      pedidos: [{ numero: "2026.0007", cliente_id: "c1", created_at: "x" }],
      clientes: [{ id: "c1", nome_fantasia: "Atacadão" }],
    });
    const r = await pedidosAbertos(sb, ctx, {});
    expect(r).toContain("#2026.0007");
    expect(r).toContain("Atacadão");
  });
});

describe("resumoDia (R4)", () => {
  it("monta o painel com frota, entregas, pedidos, avaria e diesel", async () => {
    const sb = fakeSb({
      veiculos: [{ id: "v1", apelido: "Leão", placa: null }, { id: "v2", apelido: "Touro", placa: null }],
      alocacoes: [
        { veiculo_id: "v1", status: "operacional", motorista_id: "m1" },
        { veiculo_id: "v2", status: "manutencao", motorista_id: null },
      ],
      entregas: [{ id: "1" }],
      pedidos: [{ id: "p1" }],
      avarias: [{ id: "a1", urgencia: "critica" }],
      abastecimentos: [{ valor_total: 500 }, { valor_total: 340.5 }],
    });
    const r = await resumoDia(sb, ctx, {});
    expect(r).toMatch(/1 rodando · 1 manutenção · 0 parados/);
    expect(r).toMatch(/TEM URGENTE/);
    expect(r).toContain("840,50");
  });
});

describe("vencimentos (R5)", () => {
  it("nada vencendo → ✅", async () => {
    const sb = fakeSb({ veiculos: [{ apelido: "Leão", placa: null, km_atual: 100000 }], motoristas: [{ nome: "Zé", cnh_validade: "2030-01-01" }] });
    expect(await vencimentos(sb, ctx, {})).toMatch(/nada vencendo/i);
  });
  it("IPVA vencido, CNH vencendo e revisão por km", async () => {
    const sb = fakeSb({
      veiculos: [{ apelido: "Leão", placa: null, km_atual: 99500, ipva_vencimento: "2026-01-10", km_proxima_revisao: 100000 }],
      motoristas: [{ nome: "Zé", cnh_validade: hojeYmd }],
    });
    const r = await vencimentos(sb, ctx, {});
    expect(r).toMatch(/IPVA do Leão: VENCIDO/);
    expect(r).toMatch(/CNH do Zé: vence/);
    expect(r).toMatch(/faltam 500 km/);
  });
});

describe("ondeEsta (R6)", () => {
  it("sem veículo identificado → pergunta qual", async () => {
    const sb = fakeSb({});
    expect(await ondeEsta(sb, ctx, {})).toMatch(/qual caminhão/i);
  });
  it("com última entrega → posição aproximada + ressalva", async () => {
    const sb = fakeSb({
      veiculos: [{ apelido: "Leão", placa: "ABC1234" }],
      entregas: [{ data_fim: "2026-06-11T17:32:00Z", destino: "Av. Central, 100", nome_cliente_avulso: null, cliente_id: "c1" }],
      clientes: [{ id: "c1", nome_fantasia: "Mercadão" }],
    });
    const r = await ondeEsta(sb, ctx, { veiculoId: "v1" });
    expect(r).toContain("📍 Leão");
    expect(r).toContain("Mercadão");
    expect(r).toMatch(/14:32/); // 17:32 UTC = 14:32 local
    expect(r).toMatch(/posição aproximada/i);
  });
});

describe("meusLembretes (R7)", () => {
  it("nenhum pendente → tudo em dia", async () => {
    const sb = fakeSb({ lembretes: [] });
    expect(await meusLembretes(sb, ctx, {})).toMatch(/tudo em dia/i);
  });
  it("lista numerada com data e autor", async () => {
    const sb = fakeSb({ lembretes: [{ texto: "Fechei com o Mercadão, 12 paletes quinta", criado_em: "2026-06-10T21:40:00Z", criado_por_nome: "Ronaldo" }] });
    const r = await meusLembretes(sb, ctx, {});
    expect(r).toMatch(/1\. "Fechei com o Mercadão/);
    expect(r).toContain("(Ronaldo)");
  });
});

describe("avariasVeiculo (R8)", () => {
  it("nenhuma avaria → ✅", async () => {
    const sb = fakeSb({ avarias: [], veiculos: [] });
    expect(await avariasVeiculo(sb, ctx, {})).toMatch(/nenhuma avaria/i);
  });
  it("separa em aberto (com urgência) de resolvidas, com caminhão na frota inteira", async () => {
    const sb = fakeSb({
      avarias: [
        { veiculo_id: "v1", status: "aberta", urgencia: "critica", descricao_motorista: "freio fazendo barulho", resolvido_em: null, created_at: "2026-06-10T12:00:00Z" },
        { veiculo_id: "v2", status: "aberta", urgencia: "baixa", descricao_motorista: "retrovisor trincado", resolvido_em: "2026-06-09T10:00:00Z", created_at: "2026-06-08T12:00:00Z" },
      ],
      veiculos: [{ id: "v1", apelido: "Leão", placa: null }, { id: "v2", apelido: "Touro", placa: null }],
    });
    const r = await avariasVeiculo(sb, ctx, {});
    expect(r).toMatch(/Em aberto \(1\)/);
    expect(r).toContain("Leão — freio fazendo barulho");
    expect(r).toMatch(/CRÍTICA/);
    expect(r).toMatch(/Histórico recente \(1\)/);
    expect(r).toContain("Touro — retrovisor trincado");
  });
  it("com veículo → omite o nome do caminhão nas linhas", async () => {
    const sb = fakeSb({
      avarias: [{ veiculo_id: "v1", status: "em_reparo", urgencia: "media", descricao_motorista: "embreagem dura", resolvido_em: null, created_at: "2026-06-10T12:00:00Z" }],
      veiculos: [{ id: "v1", apelido: "Leão", placa: null }],
    });
    const r = await avariasVeiculo(sb, ctx, { veiculoId: "v1" });
    expect(r).toContain("Avarias do Leão");
    expect(r).toContain("• embreagem dura");
    expect(r).toMatch(/em reparo/);
  });
});

describe("manutencoesPeriodicas (R9)", () => {
  it("nada configurado → orienta cadastrar tipos", async () => {
    const sb = fakeSb({ proxima_manutencao_veiculo: [], veiculos: [] });
    expect(await manutencoesPeriodicas(sb, ctx, {})).toMatch(/cadastre os tipos/i);
  });
  it("frota: vencidas + chegando detalhadas, em dia só contagem", async () => {
    const sb = fakeSb({
      proxima_manutencao_veiculo: [
        { veiculo_id: "v1", placa: "ABC0001", tipo_nome: "Troca de óleo", status: "vencido", km_faltando: -1200, km_proxima: 100000, data_proxima: null, criticidade: "alta" },
        { veiculo_id: "v2", placa: "DEF0002", tipo_nome: "Filtro de ar", status: "proximo", km_faltando: 800, km_proxima: 120000, data_proxima: "2026-06-20", criticidade: "media" },
        { veiculo_id: "v2", placa: "DEF0002", tipo_nome: "Correia", status: "ok", km_faltando: 9000, km_proxima: 130000, data_proxima: null, criticidade: "baixa" },
      ],
      veiculos: [{ id: "v1", apelido: "Leão", placa: "ABC0001" }, { id: "v2", apelido: "Touro", placa: "DEF0002" }],
    });
    const r = await manutencoesPeriodicas(sb, ctx, {});
    expect(r).toMatch(/VENCIDAS \(1\)/);
    expect(r).toContain("Troca de óleo do Leão (passou 1.200 km)");
    expect(r).toMatch(/Chegando \(1\)/);
    expect(r).toContain("Filtro de ar do Touro (faltam 800 km · 20/06)");
    expect(r).toMatch(/1 item em dia/);
  });
  it("um caminhão: lista também o que está em dia, sem repetir o nome", async () => {
    const sb = fakeSb({
      proxima_manutencao_veiculo: [
        { veiculo_id: "v1", placa: "ABC0001", tipo_nome: "Troca de óleo", status: "ok", km_faltando: 4500, km_proxima: 105000, data_proxima: null, criticidade: "alta" },
      ],
      veiculos: [{ id: "v1", apelido: "Leão", placa: "ABC0001" }],
    });
    const r = await manutencoesPeriodicas(sb, ctx, { veiculoId: "v1" });
    expect(r).toContain("Manutenções periódicas do Leão");
    expect(r).toMatch(/Em dia \(1\)/);
    expect(r).toContain("• Troca de óleo (faltam 4.500 km)");
  });
});

describe("dispatch LEITORES", () => {
  it("tem as 9 chaves do plano", () => {
    expect(Object.keys(LEITORES).sort()).toEqual([
      "andamento_rotas", "avarias", "entregas_dia", "manutencoes_periodicas", "meus_lembretes",
      "onde_esta", "pedidos_abertos", "resumo_dia", "vencimentos",
    ]);
  });
});

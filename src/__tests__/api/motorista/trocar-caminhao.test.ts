/**
 * Testes da API route POST /api/motorista/trocar-caminhao — troca de caminhão
 * pelo app do motorista: encerra alocações abertas, cria a nova e avisa o
 * gestor via lembretes (sem travar mesmo se o caminhão estava com outro).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { POST } from '@/app/api/motorista/trocar-caminhao/route';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/motorista/trocar-caminhao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BODY_OK = { motorista_id: 'm1', empresa_id: 'e1', veiculo_id_novo: 'v2' };
const VEICULO_NOVO = { id: 'v2', apelido: 'Touro', modelo: 'VW 17.210', placa: 'XYZ9A88', km_atual: 90000 };

/** Builder fluente fake: encadeia qualquer método e resolve com o resultado dado. */
function builder(result: { data?: unknown; error?: unknown }) {
  const fim = Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'order', 'in']) b[m] = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => fim);
  (b as { then: unknown }).then = fim.then.bind(fim); // permite await direto (update/insert)
  return b;
}

/** Registra a sequência de chamadas from(tabela) e devolve resultados enfileirados. */
let chamadas: Array<{ tabela: string; op: string; payload?: unknown }>;
let fila: Array<{ data?: unknown; error?: unknown }>;

function setupSupabase(respostas: Array<{ data?: unknown; error?: unknown }>) {
  fila = [...respostas];
  supabaseFromMock.mockImplementation((tabela: string) => {
    const resultado = fila.shift() ?? { data: null, error: null };
    const b = builder(resultado);
    b.update = vi.fn((payload: unknown) => {
      chamadas.push({ tabela, op: 'update', payload });
      return b;
    });
    b.insert = vi.fn((payload: unknown) => {
      chamadas.push({ tabela, op: 'insert', payload });
      return b;
    });
    return b;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/motorista/trocar-caminhao', () => {
  it('400 quando faltam campos obrigatórios', async () => {
    const res = await POST(makeReq({ motorista_id: 'm1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).erro).toBe('campos_obrigatorios');
  });

  it('404 quando o caminhão novo não existe', async () => {
    setupSupabase([{ data: null }]); // veiculos → não achou
    const res = await POST(makeReq(BODY_OK));
    expect(res.status).toBe(404);
    expect((await res.json()).erro).toBe('veiculo_nao_encontrado');
  });

  it('409 quando o motorista já está com esse caminhão', async () => {
    setupSupabase([
      { data: VEICULO_NOVO },                  // veiculos (novo)
      { data: { nome: 'João' } },              // motoristas (nome)
      { data: { id: 'aloc-1', veiculo_id: 'v2' } }, // alocação atual JÁ é o v2
    ]);
    const res = await POST(makeReq(BODY_OK));
    expect(res.status).toBe(409);
    expect((await res.json()).erro).toBe('mesmo_veiculo');
  });

  it('troca completa: encerra a alocação atual e a do colega, cria a nova e avisa o gestor', async () => {
    setupSupabase([
      { data: VEICULO_NOVO },                                       // veiculos (novo)
      { data: { nome: 'João Silva' } },                             // motoristas (nome)
      { data: { id: 'aloc-1', veiculo_id: 'v1' } },                 // alocação atual do João (v1)
      { data: { apelido: 'Leão', modelo: 'VW 24.280', placa: 'ABC1D23' } }, // veículo anterior
      { data: { id: 'aloc-2', motorista_id: 'm2' } },               // v2 estava com outro motorista
      { data: { nome: 'Pedro Souza' } },                            // nome do outro
      { data: null },                                               // update fim aloc-1
      { data: null },                                               // update fim aloc-2
      { data: null },                                               // insert alocação nova
      { data: null },                                               // insert lembrete
    ]);

    const res = await POST(makeReq(BODY_OK));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.veiculo).toEqual(VEICULO_NOVO);
    expect(json.aviso_gestor).toBe(true);

    // Encerrou as DUAS alocações abertas (a do João e a do Pedro no v2).
    const updates = chamadas.filter((c) => c.tabela === 'alocacoes' && c.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates.every((u) => typeof (u.payload as { fim?: string }).fim === 'string')).toBe(true);

    // Criou a alocação nova operacional do João no v2.
    const insertAloc = chamadas.find((c) => c.tabela === 'alocacoes' && c.op === 'insert');
    expect(insertAloc?.payload).toMatchObject({
      veiculo_id: 'v2',
      motorista_id: 'm1',
      status: 'operacional',
    });

    // Avisou o gestor: lembrete com origem do app e citando a troca e o colega.
    const insertLembrete = chamadas.find((c) => c.tabela === 'lembretes' && c.op === 'insert');
    const lembrete = insertLembrete?.payload as { texto: string; origem: string; empresa_id: string };
    expect(lembrete.origem).toBe('app_motorista');
    expect(lembrete.empresa_id).toBe('e1');
    expect(lembrete.texto).toContain('João Silva');
    expect(lembrete.texto).toContain('Leão (ABC1D23)');
    expect(lembrete.texto).toContain('Touro (XYZ9A88)');
    expect(lembrete.texto).toContain('estava com Pedro Souza');
  });

  it('funciona sem alocação anterior (motorista sem caminhão) e caminhão livre', async () => {
    setupSupabase([
      { data: VEICULO_NOVO },           // veiculos (novo)
      { data: { nome: 'João Silva' } }, // motoristas
      { data: null },                   // sem alocação atual
      { data: null },                   // v2 livre (sem alocação aberta)
      { data: null },                   // insert alocação nova
      { data: null },                   // insert lembrete
    ]);

    const res = await POST(makeReq(BODY_OK));

    expect(res.status).toBe(201);
    // Nenhum update (não havia alocações pra encerrar), só inserts.
    expect(chamadas.filter((c) => c.op === 'update')).toHaveLength(0);
    const lembrete = chamadas.find((c) => c.tabela === 'lembretes')?.payload as { texto: string };
    expect(lembrete.texto).toContain('nenhum caminhão');
    expect(lembrete.texto).not.toContain('estava com');
  });

  it('500 quando o insert da alocação nova falha', async () => {
    setupSupabase([
      { data: VEICULO_NOVO },
      { data: { nome: 'João' } },
      { data: null },
      { data: null },
      { error: { message: 'db down' } }, // insert alocação falha
    ]);

    const res = await POST(makeReq(BODY_OK));

    expect(res.status).toBe(500);
    expect((await res.json()).erro).toBe('db_nova_alocacao');
  });
});

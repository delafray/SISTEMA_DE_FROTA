/**
 * Testes unitários para frotaTools — buscarKmCaminhao e atualizarKmCaminhao.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do Supabase ─────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();
const mockIn = vi.fn();
const mockInsert = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

// Cadeia fluente: from → select → eq → eq → order → limit → maybeSingle
function buildChain(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  return chain;
}

import {
  buscarKmCaminhao,
  atualizarKmCaminhao,
  executarTool,
} from '@/lib/ai/tools/frotaTools';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── buscarKmCaminhao ─────────────────────────────────────────────────

describe('buscarKmCaminhao', () => {
  it('retorna km via km_logs quando existe registro do motorista', async () => {
    // Sequência: from('km_logs') → chain com kmLog
    // Sequência: from('veiculos') → chain com veiculo
    mockFrom
      .mockReturnValueOnce(
        buildChain({ data: { veiculo_id: 'v-1', km_lido: 45000, created_at: '2026-05-30T00:00:00Z' } })
      )
      .mockReturnValueOnce(
        buildChain({
          data: {
            placa: 'ABC1D23',
            km_atual: 45000,
            apelido: 'Grandão',
            marca: 'Volvo',
            modelo: 'FH540',
          },
        })
      );

    const result = await buscarKmCaminhao('empresa-1', 'motorista-1');

    expect(result.ok).toBe(true);
    expect((result.dados as { placa: string }).placa).toBe('ABC1D23');
    expect((result.dados as { km_atual: number }).km_atual).toBe(45000);
  });

  it('retorna erro quando nao ha km_log nem pedido ativo', async () => {
    // km_logs → sem dados
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      // pedidos → sem dados
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await buscarKmCaminhao('empresa-1', 'motorista-1');

    expect(result.ok).toBe(false);
    expect(result.erro).toContain('Nao encontrei');
  });

  it('retorna erro quando motoristaId e vazio', async () => {
    const result = await buscarKmCaminhao('empresa-1', '');
    expect(result.ok).toBe(false);
    expect(result.erro).toBe('motorista nao identificado');
  });
});

// ─── atualizarKmCaminhao ──────────────────────────────────────────────

describe('atualizarKmCaminhao', () => {
  it('registra novo km com sucesso quando valor e valido e maior que o atual', async () => {
    // buscarKmCaminhao: km_logs → maybeSingle → {veiculo_id}
    // buscarKmCaminhao: veiculos → maybeSingle → {placa, km_atual}
    // atualizarKmCaminhao: veiculos (por placa) → maybeSingle → {id, km_atual}
    // atualizarKmCaminhao: km_logs.insert → {error: null}
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 100, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 100, apelido: null, marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', km_atual: 100 } }))
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await atualizarKmCaminhao('empresa-1', 'motorista-1', 200);

    expect(result.ok).toBe(true);
    expect((result.dados as { km_registrado: number }).km_registrado).toBe(200);
    expect((result.dados as { km_anterior: number }).km_anterior).toBe(100);
  });

  it('rejeita km menor que o atual', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 50000, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 50000, apelido: null, marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', km_atual: 50000 } }));

    const result = await atualizarKmCaminhao('empresa-1', 'motorista-1', 30000);

    expect(result.ok).toBe(false);
    expect(result.erro).toContain('menor que o atual');
  });

  it('rejeita km invalido (zero)', async () => {
    const result = await atualizarKmCaminhao('empresa-1', 'motorista-1', 0);
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('km invalido');
  });

  it('rejeita km invalido (acima do maximo)', async () => {
    const result = await atualizarKmCaminhao('empresa-1', 'motorista-1', 10_000_000);
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('km invalido');
  });

  it('retorna erro quando motoristaId esta vazio', async () => {
    const result = await atualizarKmCaminhao('empresa-1', '', 45000);
    expect(result.ok).toBe(false);
    expect(result.erro).toBe('motorista nao identificado');
  });
});

// ─── executarTool dispatcher ──────────────────────────────────────────

describe('executarTool — novas tools', () => {
  it('dispatcha buscar_km_caminhao com motoristaId', async () => {
    // sem km_log, sem pedido → erro controlado
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await executarTool('buscar_km_caminhao', 'emp-1', 'mot-1');
    expect(result.ok).toBe(false); // sem km_log retorna erro
  });

  it('dispatcha atualizar_km_caminhao com args', async () => {
    // sem km_log → buscarKmCaminhao retorna erro → atualizarKmCaminhao falha early
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await executarTool('atualizar_km_caminhao', 'emp-1', 'mot-1', { km_novo: 45000 });
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('caminhao');
  });

  it('retorna erro para tool desconhecida', async () => {
    const result = await executarTool('ferramenta_inexistente', 'emp-1');
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('tool desconhecida');
  });
});

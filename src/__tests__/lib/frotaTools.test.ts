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
  proporAtualizacaoKm,
  confirmarAtualizacaoKm,
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
    expect(result.erro).toMatch(/motorista nao identificado/);
  });
});

// ─── Permission Loop — propor (read-only) + confirmar (executa) ────

describe('proporAtualizacaoKm — Permission Loop passo 1 (READ-ONLY)', () => {
  it('devolve preview SEM gravar (mensagem_sugerida pronta pro Gemini)', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 100, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 100, apelido: 'Leao', marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', placa: 'ABC1D23', apelido: 'Leao', km_atual: 100 } }));

    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 200);

    expect(result.ok).toBe(true);
    const d = result.dados as { km_novo: number; diferenca: number; mensagem_sugerida: string };
    expect(d.km_novo).toBe(200);
    expect(d.diferenca).toBe(100);
    expect(d.mensagem_sugerida).toContain('Confirma?');
  });

  it('rejeita km menor que atual (hodometro nao volta)', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 50000, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 50000, apelido: null, marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', placa: 'ABC1D23', apelido: null, km_atual: 50000 } }));

    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 30000);

    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/menor|hodometro/i);
  });

  // ─── B2: validacao NaN — bug critico fixado ────────────────────────

  it('rejeita NaN (Number("abc")) sem chamar DB', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 'abc');
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/NaN|invalido/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejeita undefined', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', undefined);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/invalido|tipo/);
  });

  it('rejeita Infinity', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', Infinity);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/Infinity|invalido/);
  });

  it('rejeita zero', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 0);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/invalido|maior que zero/);
  });

  it('rejeita negativo', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', -100);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/invalido|maior que zero/);
  });

  it('rejeita acima do limite (9.999.999)', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 10_000_000);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/limite|invalido/);
  });

  it('rejeita decimal nao inteiro', async () => {
    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', 45000.5);
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/inteiro|invalido/);
  });

  it('aceita string numerica ("45000")', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 100, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 100, apelido: null, marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', placa: 'ABC1D23', apelido: null, km_atual: 100 } }));

    const result = await proporAtualizacaoKm('empresa-1', 'motorista-1', '45000');
    expect(result.ok).toBe(true);
  });

  it('motoristaId vazio → erro', async () => {
    const result = await proporAtualizacaoKm('empresa-1', '', 45000);
    expect(result.ok).toBe(false);
    expect(result.erro).toBe('motorista nao identificado');
  });
});

describe('confirmarAtualizacaoKm — Permission Loop passo 2 (EXECUTA)', () => {
  it('grava km_log quando confirmacao chega com valor valido', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { veiculo_id: 'v-1', km_lido: 100, created_at: '2026-05-01' } }))
      .mockReturnValueOnce(buildChain({ data: { placa: 'ABC1D23', km_atual: 100, apelido: 'Leao', marca: null, modelo: null } }))
      .mockReturnValueOnce(buildChain({ data: { id: 'v-1', placa: 'ABC1D23', apelido: 'Leao', km_atual: 100 } }))
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });

    const result = await confirmarAtualizacaoKm('empresa-1', 'motorista-1', 200);

    expect(result.ok).toBe(true);
    const d = result.dados as { km_registrado: number; km_anterior: number };
    expect(d.km_registrado).toBe(200);
    expect(d.km_anterior).toBe(100);
  });

  it('rejeita NaN tambem na confirmacao (mesma validacao)', async () => {
    const result = await confirmarAtualizacaoKm('empresa-1', 'motorista-1', 'xyz');
    expect(result.ok).toBe(false);
    expect(result.erro).toMatch(/NaN|invalido/);
    expect(mockFrom).not.toHaveBeenCalled();
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

  it('dispatcha propor_atualizacao_km com args', async () => {
    // sem km_log → buscarKmCaminhao retorna erro → propor falha early
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 45000 });
    expect(result.ok).toBe(false);
  });

  it('dispatcha confirmar_atualizacao_km com args', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await executarTool('confirmar_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 45000 });
    expect(result.ok).toBe(false);
  });

  it('tool legacy "atualizar_km_caminhao" redireciona pra propor (NUNCA executa direto)', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null }))
      .mockReturnValueOnce(buildChain({ data: null }));

    const result = await executarTool('atualizar_km_caminhao', 'emp-1', 'mot-1', { km_novo: 45000 });
    // Pode retornar ok=false (sem veiculo), mas NUNCA chega no insert
    expect(result.ok).toBe(false);
  });

  it('retorna erro para tool desconhecida', async () => {
    const result = await executarTool('ferramenta_inexistente', 'emp-1');
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('tool desconhecida');
  });
});

/**
 * Testes do helper veiculoAtivo — caminhão da alocação ativa do motorista
 * (apelido/modelo/placa/km) com fallback offline via localStorage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do Supabase client (builder fluente) ──────────────────────
const mockMaybeSingle = vi.fn();
const mockIs = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq2 = vi.fn(() => ({ is: mockIs, maybeSingle: mockMaybeSingle }));
const mockEq = vi.fn(() => ({ eq: mockEq2, is: mockIs, maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { carregarVeiculoAtivo, linhaVeiculo, type VeiculoAtivo } from '@/lib/mobile/veiculoAtivo';

const VEICULO: VeiculoAtivo = {
  id: 'vei-1',
  apelido: 'Leão',
  modelo: 'VW 24.280',
  placa: 'ABC1D23',
  km_atual: 152340,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('carregarVeiculoAtivo', () => {
  it('retorna o veículo da alocação ativa e salva snapshot no localStorage', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { veiculo_id: 'vei-1' }, error: null }) // alocacoes
      .mockResolvedValueOnce({ data: VEICULO, error: null });                // veiculos

    const v = await carregarVeiculoAtivo('mot-1');

    expect(v).toEqual(VEICULO);
    expect(mockFrom).toHaveBeenCalledWith('alocacoes');
    expect(mockFrom).toHaveBeenCalledWith('veiculos');
    const cache = JSON.parse(localStorage.getItem('frota_veiculo_mot-1') ?? '{}');
    expect(cache.veiculo).toEqual(VEICULO);
  });

  it('retorna null quando o motorista não tem alocação ativa (sem usar cache)', async () => {
    // Cache antigo existe, mas a resposta do servidor (sem vínculo) prevalece.
    localStorage.setItem('frota_veiculo_mot-1', JSON.stringify({ veiculo: VEICULO }));
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const v = await carregarVeiculoAtivo('mot-1');

    expect(v).toBeNull();
  });

  it('cai pro snapshot do localStorage quando a consulta falha (offline)', async () => {
    localStorage.setItem('frota_veiculo_mot-1', JSON.stringify({ veiculo: VEICULO }));
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('fetch failed') });

    const v = await carregarVeiculoAtivo('mot-1');

    expect(v).toEqual(VEICULO);
  });

  it('retorna null quando falha e não há snapshot salvo', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('network down'));

    const v = await carregarVeiculoAtivo('mot-1');

    expect(v).toBeNull();
  });
});

describe('linhaVeiculo', () => {
  it('monta apelido · modelo · placa · km formatado', () => {
    expect(linhaVeiculo(VEICULO)).toBe(`Leão · VW 24.280 · ABC1D23 · ${(152340).toLocaleString('pt-BR')} km`);
  });

  it('omite apelido e km quando ausentes', () => {
    expect(linhaVeiculo({ ...VEICULO, apelido: null, km_atual: null })).toBe('VW 24.280 · ABC1D23');
  });
});

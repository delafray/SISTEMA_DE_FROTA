/**
 * Testes das tools que o Gemini pode chamar pra consultar a frota.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { listarMotoristas, listarVeiculos, executarTool } from '@/lib/ai/tools/frotaTools';

function setupSelect(returnData: unknown[], error: { message: string } | null = null) {
  supabaseFromMock.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: returnData, error })),
        })),
      })),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('listarMotoristas', () => {
  it('sucesso: devolve quantidade + nomes', async () => {
    setupSelect([{ nome: 'Carlos' }, { nome: 'João' }, { nome: 'Pedro' }]);

    const res = await listarMotoristas('emp-1');

    expect(res.ok).toBe(true);
    expect(res.dados).toEqual({
      quantidade: 3,
      nomes: ['Carlos', 'João', 'Pedro'],
    });
  });

  it('zero motoristas: devolve quantidade 0 e array vazio', async () => {
    setupSelect([]);

    const res = await listarMotoristas('emp-1');

    expect(res.ok).toBe(true);
    expect(res.dados).toEqual({ quantidade: 0, nomes: [] });
  });

  it('sem empresaId: erro', async () => {
    const res = await listarMotoristas('');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('empresa');
  });

  it('erro DB: propaga motivo', async () => {
    setupSelect([], { message: 'connection refused' });
    const res = await listarMotoristas('emp-1');
    expect(res.ok).toBe(false);
    expect(res.erro).toBe('connection refused');
  });
});

describe('listarVeiculos', () => {
  it('sucesso: devolve quantidade + detalhes', async () => {
    setupSelect([
      { placa: 'ABC1234', apelido: 'Tigrão', marca: 'Volvo', modelo: 'FH16' },
      { placa: 'XYZ5678', apelido: null, marca: 'Scania', modelo: 'R450' },
    ]);

    const res = await listarVeiculos('emp-1');

    expect(res.ok).toBe(true);
    expect(res.dados).toEqual({
      quantidade: 2,
      veiculos: [
        { placa: 'ABC1234', apelido: 'Tigrão', marca: 'Volvo', modelo: 'FH16' },
        { placa: 'XYZ5678', apelido: null, marca: 'Scania', modelo: 'R450' },
      ],
    });
  });

  it('zero veiculos: quantidade 0', async () => {
    setupSelect([]);
    const res = await listarVeiculos('emp-1');
    expect(res.ok).toBe(true);
    expect(res.dados).toEqual({ quantidade: 0, veiculos: [] });
  });
});

describe('executarTool dispatcher', () => {
  it('routeia listar_motoristas', async () => {
    setupSelect([{ nome: 'Ana' }]);
    const res = await executarTool('listar_motoristas', 'emp-1');
    expect(res.ok).toBe(true);
    expect((res.dados as { quantidade: number }).quantidade).toBe(1);
  });

  it('routeia listar_veiculos', async () => {
    setupSelect([{ placa: 'ABC1234', apelido: null, marca: null, modelo: null }]);
    const res = await executarTool('listar_veiculos', 'emp-1');
    expect(res.ok).toBe(true);
    expect((res.dados as { quantidade: number }).quantidade).toBe(1);
  });

  it('tool desconhecida: erro', async () => {
    const res = await executarTool('inventada', 'emp-1');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('desconhecida');
  });
});

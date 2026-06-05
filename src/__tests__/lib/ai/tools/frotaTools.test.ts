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

import { listarMotoristas, listarVeiculos, executarTool, buscarKmCaminhao, meuCaminhao, criarLembrete } from '@/lib/ai/tools/frotaTools';

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

  // ─── Permission Loop: propor_atualizacao_km / confirmar_atualizacao_km ──

  it('propor_atualizacao_km: NaN → erro de validacao (NUNCA grava)', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 'abc' });
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/NaN|invalido/);
  });

  it('propor_atualizacao_km: numero negativo → erro', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', { km_novo: -500 });
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/invalido|maior que zero/);
  });

  it('propor_atualizacao_km: undefined → erro', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', {});
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/invalido|tipo inesperado/);
  });

  it('propor_atualizacao_km: maior que limite (9.999.999) → erro', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 10_000_000 });
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/limite|invalido/);
  });

  it('confirmar_atualizacao_km: NaN → erro (mesma validacao)', async () => {
    const res = await executarTool('confirmar_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 'xyz' });
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/NaN|invalido/);
  });

  // Nota: legacy redirect + integracao Permission Loop completa testados em
  // src/__tests__/lib/frotaTools.test.ts (mocks do supabase mais robustos).
});

describe('buscarKmCaminhao — modo placa_ou_apelido', () => {
  function setupBuscaPorApelido(veiculos: unknown[], error: { message: string } | null = null) {
    supabaseFromMock.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: veiculos, error })),
            })),
          })),
        })),
      })),
    });
  }

  it('com apelido "leao": acha 1 caminhao e devolve dados', async () => {
    setupBuscaPorApelido([
      { id: 'v-1', placa: 'ABC1234', apelido: 'leao', marca: 'Volvo', modelo: 'FH16', km_atual: 185000 },
    ]);
    const res = await buscarKmCaminhao('emp-1', 'mot-1', 'leao');
    expect(res.ok).toBe(true);
    expect((res.dados as { apelido: string; km_atual: number }).apelido).toBe('leao');
    expect((res.dados as { km_atual: number }).km_atual).toBe(185000);
  });

  it('com apelido inexistente: erro descritivo', async () => {
    setupBuscaPorApelido([]);
    const res = await buscarKmCaminhao('emp-1', 'mot-1', 'panda');
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/panda/);
    expect(res.erro).toMatch(/listar_veiculos/);
  });

  it('com apelido ambiguo: pede pra desambiguar', async () => {
    setupBuscaPorApelido([
      { id: 'v-1', placa: 'ABC1234', apelido: 'leao da silva', marca: null, modelo: null, km_atual: 100 },
      { id: 'v-2', placa: 'XYZ9876', apelido: 'leao filho', marca: null, modelo: null, km_atual: 200 },
    ]);
    const res = await buscarKmCaminhao('emp-1', 'mot-1', 'leao');
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/mais de um/i);
    expect(res.erro).toContain('ABC1234');
    expect(res.erro).toContain('XYZ9876');
  });

  it('sem empresaId: erro', async () => {
    const res = await buscarKmCaminhao('', 'mot-1', 'leao');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('empresa');
  });
});

describe('meuCaminhao', () => {
  it('sem motoristaId: erro', async () => {
    const res = await meuCaminhao('emp-1', '');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('motorista');
  });

  it('com motoristaId: delega pra buscarKmCaminhao sem filtro (cai no fluxo de km_logs)', async () => {
    // Mock retornando null em km_logs e null em pedidos → fim de fluxo com erro de "nao encontrei"
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'km_logs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'pedidos') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })) };
    });
    const res = await meuCaminhao('emp-1', 'mot-1');
    // Sem km_logs nem pedido ativo, devolve erro de "nao encontrei caminhao vinculado"
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/vinculado|nao encontrei/i);
  });
});

describe('executarTool — novas rotas', () => {
  it('routeia meu_caminhao', async () => {
    const res = await executarTool('meu_caminhao', 'emp-1', '');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('motorista');
  });

  // B21: motoristaId undefined NAO deve virar string vazia silenciosamente.
  // Dispatcher devolve codigo:'sem_permissao' explicito.
  it('B21: motoristaId undefined em meu_caminhao → codigo sem_permissao', async () => {
    const res = await executarTool('meu_caminhao', 'emp-1', undefined);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
    expect(res.erro).toContain('motorista');
  });

  it('B21: motoristaId="" tratado como ausente em propor_atualizacao_km', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', '', { km_novo: 50000 });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
  });

  it('B21: motoristaId="   " (apenas whitespace) tratado como ausente', async () => {
    const res = await executarTool('confirmar_atualizacao_km', 'emp-1', '   ', { km_novo: 50000 });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
  });

  it('B21: km invalido → codigo "validacao" (nao "sem_permissao")', async () => {
    const res = await executarTool('propor_atualizacao_km', 'emp-1', 'mot-1', { km_novo: 'abc' });
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('validacao');
  });

  it('routeia buscar_km_caminhao com placa_ou_apelido nos args', async () => {
    supabaseFromMock.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: [{ id: 'v-1', placa: 'XYZ', apelido: 'tigrao', marca: null, modelo: null, km_atual: 50000 }],
                error: null,
              })),
            })),
          })),
        })),
      })),
    });
    const res = await executarTool('buscar_km_caminhao', 'emp-1', 'mot-1', { placa_ou_apelido: 'tigrao' });
    expect(res.ok).toBe(true);
    expect((res.dados as { km_atual: number }).km_atual).toBe(50000);
  });
});

describe('criarLembrete', () => {
  function setupInsert(error: { message: string } | null = null) {
    const insertMock = vi.fn(() => Promise.resolve({ error }));
    supabaseFromMock.mockReturnValue({ insert: insertMock });
    return insertMock;
  }

  it('sucesso: INSERT em lembretes com payload certo', async () => {
    const insertMock = setupInsert();
    const res = await criarLembrete('emp-1', 'usr-1', 'Ligar pro cliente João amanhã');

    expect(res.ok).toBe(true);
    expect(supabaseFromMock).toHaveBeenCalledWith('lembretes');
    expect(insertMock).toHaveBeenCalledWith({
      empresa_id: 'emp-1',
      usuario_id: 'usr-1',
      texto: 'Ligar pro cliente João amanhã',
      origem: 'whatsapp',
    });
  });

  it('sem empresaId: erro sem_permissao, NÃO grava', async () => {
    const insertMock = setupInsert();
    const res = await criarLembrete('', 'usr-1', 'x');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('sem usuarioId: erro sem_permissao, NÃO grava', async () => {
    const insertMock = setupInsert();
    const res = await criarLembrete('emp-1', undefined, 'x');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('texto vazio/whitespace: erro validacao, NÃO grava', async () => {
    const insertMock = setupInsert();
    const res = await criarLembrete('emp-1', 'usr-1', '   ');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('validacao');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('texto não-string: erro validacao', async () => {
    setupInsert();
    const res = await criarLembrete('emp-1', 'usr-1', 123);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('validacao');
  });

  it('erro de DB: codigo db', async () => {
    setupInsert({ message: 'connection refused' });
    const res = await criarLembrete('emp-1', 'usr-1', 'teste');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('db');
  });

  it('dispatcher: executarTool routeia criar_lembrete passando usuarioId (5º arg)', async () => {
    const insertMock = setupInsert();
    const res = await executarTool('criar_lembrete', 'emp-1', undefined, { texto: 'anota isso' }, 'usr-9');
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'usr-9',
      texto: 'anota isso',
    }));
  });

  it('dispatcher: sem usuarioId → sem_permissao', async () => {
    setupInsert();
    const res = await executarTool('criar_lembrete', 'emp-1', undefined, { texto: 'x' }, undefined);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('sem_permissao');
  });
});

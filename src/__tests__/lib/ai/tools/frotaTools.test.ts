/**
 * Testes da ÚNICA tool da IA: criar_lembrete.
 * (As tools de KM/listar foram removidas — IA virgem, decisão do dono 05/06/2026.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { executarTool, criarLembrete, declarations } from '@/lib/ai/tools/frotaTools';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('declarations — só criar_lembrete', () => {
  it('expõe exatamente UMA tool: criar_lembrete', () => {
    expect(declarations).toHaveLength(1);
    expect(declarations[0].name).toBe('criar_lembrete');
  });

  it('NENHUMA tool tem parameters com properties vazio (quebraria mode ANY)', () => {
    for (const d of declarations) {
      const props = (d.parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
      const okSemParams = !d.parameters;
      const okComProps = !!props && Object.keys(props).length > 0;
      expect(okSemParams || okComProps).toBe(true);
    }
  });

  it('criar_lembrete MANTÉM o parametro texto', () => {
    const d = declarations.find((x) => x.name === 'criar_lembrete');
    const props = (d?.parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
    expect(props && Object.keys(props)).toContain('texto');
  });
});

describe('executarTool dispatcher', () => {
  function setupInsert(error: { message: string } | null = null) {
    const insertMock = vi.fn(() => Promise.resolve({ error }));
    supabaseFromMock.mockReturnValue({ insert: insertMock });
    return insertMock;
  }

  it('tool desconhecida: erro', async () => {
    const res = await executarTool('inventada', 'emp-1');
    expect(res.ok).toBe(false);
    expect(res.erro).toContain('desconhecida');
  });

  it('routeia criar_lembrete passando usuarioId (5º arg)', async () => {
    const insertMock = setupInsert();
    const res = await executarTool('criar_lembrete', 'emp-1', undefined, { texto: 'anota isso' }, 'usr-9');
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'usr-9',
      texto: 'anota isso',
    }));
  });

  it('sem usuarioId → ainda salva (usuario_id null)', async () => {
    const insertMock = setupInsert();
    const res = await executarTool('criar_lembrete', 'emp-1', undefined, { texto: 'x' }, undefined);
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: null }));
  });

  it('propaga remetente (nome/telefone) pra criado_por_*', async () => {
    const insertMock = setupInsert();
    const res = await executarTool(
      'criar_lembrete', 'emp-1', undefined, { texto: 'ligar pro cliente' }, 'usr-1',
      { nome: 'Ronaldo', telefone: '5531999' }
    );
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      texto: 'ligar pro cliente',
      criado_por_nome: 'Ronaldo',
      criado_por_telefone: '5531999',
    }));
  });
});

describe('criarLembrete', () => {
  // Mock combinado: 'lembretes' → insert; 'empresas' → empresa default (sem-trava).
  function setupMock(opts: { insertError?: { message: string } | null; empresaDefault?: string | null } = {}) {
    const insertMock = vi.fn(() => Promise.resolve({ error: opts.insertError ?? null }));
    const empresaId = opts.empresaDefault === undefined ? 'emp-default' : opts.empresaDefault;
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'empresas') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: empresaId ? { id: empresaId } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      return { insert: insertMock };
    });
    return insertMock;
  }

  it('sucesso: INSERT em lembretes com payload certo', async () => {
    const insertMock = setupMock();
    const res = await criarLembrete('emp-1', 'usr-1', 'Ligar pro cliente João amanhã');

    expect(res.ok).toBe(true);
    expect(supabaseFromMock).toHaveBeenCalledWith('lembretes');
    expect(insertMock).toHaveBeenCalledWith({
      empresa_id: 'emp-1',
      usuario_id: 'usr-1',
      texto: 'Ligar pro cliente João amanhã',
      origem: 'whatsapp',
      criado_por_nome: null,
      criado_por_telefone: null,
    });
  });

  it('SEM TRAVA: sem empresaId → cai na empresa default e SALVA', async () => {
    const insertMock = setupMock({ empresaDefault: 'emp-default' });
    const res = await criarLembrete('', 'usr-1', 'x');
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: 'emp-default' }));
  });

  it('sem usuarioId: AINDA salva, usuario_id null', async () => {
    const insertMock = setupMock();
    const res = await criarLembrete('emp-1', undefined, 'x');
    expect(res.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: null }));
  });

  it('guarda nome + telefone de quem criou', async () => {
    const insertMock = setupMock();
    await criarLembrete('emp-1', undefined, 'comprar pneu', 'Ronaldo', '5531999');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      criado_por_nome: 'Ronaldo',
      criado_por_telefone: '5531999',
    }));
  });

  it('texto vazio/whitespace: erro validacao, NÃO grava', async () => {
    const insertMock = setupMock();
    const res = await criarLembrete('emp-1', 'usr-1', '   ');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('validacao');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('texto não-string: erro validacao', async () => {
    setupMock();
    const res = await criarLembrete('emp-1', 'usr-1', 123);
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('validacao');
  });

  it('erro de DB: codigo db', async () => {
    setupMock({ insertError: { message: 'connection refused' } });
    const res = await criarLembrete('emp-1', 'usr-1', 'teste');
    expect(res.ok).toBe(false);
    expect(res.codigo).toBe('db');
  });
});

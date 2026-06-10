import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { Sessao } from '@/lib/whatsapp/sessionManager';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/whatsapp/messageSender', () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/menuHelper', () => ({
  enviarMenuBotoes: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/sessionManager', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

// Mock de supabase com builder encadeável: select→eq→gte→order→limit→maybeSingle,
// delete/update encadeados e await-áveis (thenable). Resultados enfileirados por tabela.
const filasMaybeSingle: Record<string, unknown[]> = {};
const operacoes: { tabela: string; op: string; filtros: Record<string, unknown>; valores?: unknown }[] = [];

function makeBuilder(tabela: string) {
  const filtros: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  b._op = 'select';
  b.select = vi.fn(() => b);
  b.delete = vi.fn(() => { b._op = 'delete'; return b; });
  b.update = vi.fn((v: unknown) => { b._op = 'update'; b._valores = v; return b; });
  b.eq = vi.fn((k: string, v: unknown) => { filtros[k] = v; return b; });
  b.gte = vi.fn(() => b);
  b.order = vi.fn(() => b);
  b.limit = vi.fn(() => b);
  b.maybeSingle = vi.fn(async () => ({ data: (filasMaybeSingle[tabela] ?? []).shift() ?? null }));
  // delete/update são await-ados direto no chain
  b.then = (resolve: (v: unknown) => void) => {
    operacoes.push({ tabela, op: b._op, filtros: { ...filtros }, valores: b._valores });
    resolve({ data: null, error: null });
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((tabela: string) => makeBuilder(tabela)) })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { ehComandoApagarUltimo, iniciarApagarUltimo, processarApagarUltimoFlow } from '@/lib/whatsapp/flows/apagarUltimoFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    from: '5531999',
    fromName: 'Motorista X',
    messageId: 'wamid.x',
    timestamp: new Date(),
    tipo: 'texto',
    phoneNumberId: 'pnid',
    ...over,
  } as ParsedMessage;
}

function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return {
    id: 'sess-1',
    whatsapp: '5531999',
    motorista_id: 'mot-1',
    usuario_id: 'usr-1',
    empresa_id: 'emp-1',
    estado: estado as Sessao['estado'],
    contexto,
    ultimo_contato: new Date().toISOString(),
  };
}

const agora = () => new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(filasMaybeSingle)) delete filasMaybeSingle[k];
  operacoes.length = 0;
});

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('ehComandoApagarUltimo', () => {
  it('reconhece variações do comando', () => {
    expect(ehComandoApagarUltimo('apaga o último')).toBe(true);
    expect(ehComandoApagarUltimo('Apagar ultimo')).toBe(true);
    expect(ehComandoApagarUltimo('desfaz o último registro')).toBe(true);
    expect(ehComandoApagarUltimo('exclui o ultimo')).toBe(true);
    expect(ehComandoApagarUltimo('cancela o último')).toBe(true);
  });
  it('não dispara em frases que só mencionam "último" ou "apagar"', () => {
    expect(ehComandoApagarUltimo('o último abastecimento foi caro')).toBe(false);
    expect(ehComandoApagarUltimo('apaga tudo')).toBe(false);
    expect(ehComandoApagarUltimo('oi')).toBe(false);
  });
});

describe('iniciarApagarUltimo (propose)', () => {
  it('sem registros nas últimas 2h → informa e NÃO muda o estado', async () => {
    await iniciarApagarUltimo(makeMsg({ texto: 'apaga o último' }), makeSessao('aguardando_acao'));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Não achei'));
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('acha o registro MAIS RECENTE entre as 3 tabelas e pede confirmação', async () => {
    const antes = new Date(Date.now() - 30 * 60_000).toISOString();
    filasMaybeSingle['abastecimentos'] = [{ id: 'ab-1', created_at: antes, litros: 45, valor_total: 387.5, posto: 'Shell' }];
    filasMaybeSingle['despesas_veiculo'] = [{ id: 'dp-1', created_at: agora(), tipo: 'pedagio', valor: 18.5, local: null }];

    await iniciarApagarUltimo(makeMsg({ texto: 'apaga o último' }), makeSessao('aguardando_acao'));

    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_confirmacao_apagar',
      contexto: expect.objectContaining({
        apagar_alvo: expect.objectContaining({ tabela: 'despesas_veiculo', id: 'dp-1' }),
      }),
    }));
    expect(enviarMenuBotoes).toHaveBeenCalled();
  });

  it('sem motorista_id na sessão → recusa (comando só de motorista)', async () => {
    const sessao = { ...makeSessao('aguardando_acao'), motorista_id: null };
    await iniciarApagarUltimo(makeMsg({ texto: 'apaga o último' }), sessao);
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('motoristas'));
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe('processarApagarUltimoFlow (confirm)', () => {
  const alvoDespesa = { tabela: 'despesas_veiculo', id: 'dp-1', descricao: '🧾 Despesa: pedagio — R$ 18,50, há 5 min' };

  it('cancelar mantém o registro (nenhum delete)', async () => {
    await processarApagarUltimoFlow(
      makeMsg({ tipo: 'botao', botaoId: 'apagar_cancela' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoDespesa })
    );
    expect(operacoes.filter(o => o.op === 'delete')).toHaveLength(0);
    expect(resetToMenu).toHaveBeenCalled();
  });

  it('confirmar revalida (dono + janela) e apaga com filtros de segurança', async () => {
    filasMaybeSingle['despesas_veiculo'] = [{ id: 'dp-1', created_at: agora(), motorista_id: 'mot-1' }];
    await processarApagarUltimoFlow(
      makeMsg({ tipo: 'botao', botaoId: 'apagar_confirma' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoDespesa })
    );
    const del = operacoes.find(o => o.op === 'delete');
    expect(del).toBeDefined();
    expect(del!.tabela).toBe('despesas_veiculo');
    expect(del!.filtros).toMatchObject({ id: 'dp-1', empresa_id: 'emp-1', motorista_id: 'mot-1' });
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Apagado'));
  });

  it('"sim" por texto também confirma', async () => {
    filasMaybeSingle['despesas_veiculo'] = [{ id: 'dp-1', created_at: agora(), motorista_id: 'mot-1' }];
    await processarApagarUltimoFlow(
      makeMsg({ texto: 'sim' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoDespesa })
    );
    expect(operacoes.find(o => o.op === 'delete')).toBeDefined();
  });

  it('revalidação falha (registro sumiu/expirou) → NÃO apaga', async () => {
    filasMaybeSingle['despesas_veiculo'] = [null as unknown as object];
    await processarApagarUltimoFlow(
      makeMsg({ tipo: 'botao', botaoId: 'apagar_confirma' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoDespesa })
    );
    expect(operacoes.filter(o => o.op === 'delete')).toHaveLength(0);
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('não está mais disponível'));
  });

  it('tabela fora da whitelist → recusa sem tocar no banco', async () => {
    await processarApagarUltimoFlow(
      makeMsg({ tipo: 'botao', botaoId: 'apagar_confirma' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: { ...alvoDespesa, tabela: 'usuarios' } })
    );
    expect(operacoes).toHaveLength(0);
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('inválido'));
  });

  it('apagar km_log recompõe o km_atual do caminhão pelo maior log restante', async () => {
    const alvoKm = { tabela: 'km_logs', id: 'km-9', descricao: '📍 KM 123.456', veiculo_id: 'vei-1' };
    filasMaybeSingle['km_logs'] = [
      { id: 'km-9', created_at: agora(), motorista_id: 'mot-1' }, // revalidação
      { km_lido: 120000 },                                        // maior restante
    ];
    await processarApagarUltimoFlow(
      makeMsg({ tipo: 'botao', botaoId: 'apagar_confirma' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoKm })
    );
    const upd = operacoes.find(o => o.op === 'update' && o.tabela === 'veiculos');
    expect(upd).toBeDefined();
    expect(upd!.valores).toEqual({ km_atual: 120000 });
    expect(upd!.filtros).toMatchObject({ id: 'vei-1', empresa_id: 'emp-1' });
  });

  it('mensagem que não é sim/não reapresenta os botões', async () => {
    await processarApagarUltimoFlow(
      makeMsg({ texto: 'talvez' }),
      makeSessao('aguardando_confirmacao_apagar', { apagar_alvo: alvoDespesa })
    );
    expect(enviarMenuBotoes).toHaveBeenCalled();
    expect(operacoes.filter(o => o.op === 'delete')).toHaveLength(0);
  });
});

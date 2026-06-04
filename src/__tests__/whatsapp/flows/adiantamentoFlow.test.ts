import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { Sessao } from '@/lib/whatsapp/sessionManager';

vi.mock('@/lib/whatsapp/messageSender', () => ({ enviarTexto: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/whatsapp/menuHelper', () => ({
  enviarMenuBotoes: vi.fn().mockResolvedValue(true),
  enviarMenuLista: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/whatsapp/sessionManager', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

import { processarAdiantamentoFlow } from '@/lib/whatsapp/flows/adiantamentoFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes, enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Motorista', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}
function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return { id: 'sess-1', whatsapp: '5531999', motorista_id: 'mot-1', usuario_id: 'usr-1', empresa_id: 'emp-1', estado: estado as Sessao['estado'], contexto, ultimo_contato: new Date().toISOString() };
}

describe('adiantamentoFlow — iniciar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('iniciar=true → envia lista de tipos + atualiza estado', async () => {
    await processarAdiantamentoFlow(makeMsg(), makeSessao('aguardando_acao'), true);
    expect(enviarMenuLista).toHaveBeenCalledOnce();
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_adiantamento_tipo' });
  });
});

describe('adiantamentoFlow — aguardando_adiantamento_tipo', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != lista → pede seleção', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'texto', texto: 'pedagio' }), makeSessao('aguardando_adiantamento_tipo'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Selecione'));
  });

  it('lista com prefixo inválido → noop silencioso', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'lista', listaId: 'acao_km' }), makeSessao('aguardando_adiantamento_tipo'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Selecione'));
  });

  it('lista "tipo_pedagio" → salva tipo + pede valor', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'lista', listaId: 'tipo_pedagio' }), makeSessao('aguardando_adiantamento_tipo'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_adiantamento_valor',
      contexto: { adiantamento_dados: { tipo: 'pedagio', tipo_label: '⛽ Pedágio' } },
    }));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('valor'));
  });
});

describe('adiantamentoFlow — aguardando_adiantamento_valor', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != texto → pede valor', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'foto' }), makeSessao('aguardando_adiantamento_valor'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('valor'));
  });

  it('valor inválido "abc" → mensagem de erro', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'texto', texto: 'abc' }), makeSessao('aguardando_adiantamento_valor'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Valor inválido'));
  });

  it('valor zero → mensagem de erro', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'texto', texto: '0' }), makeSessao('aguardando_adiantamento_valor'));
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('valor "200,00" → envia confirmação + atualiza estado', async () => {
    const sessao = makeSessao('aguardando_adiantamento_valor', { adiantamento_dados: { tipo: 'pedagio', tipo_label: '⛽ Pedágio' } });
    await processarAdiantamentoFlow(makeMsg({ tipo: 'texto', texto: '200,00' }), sessao);

    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const [, , texto, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('200');
    expect(texto).toContain('Pedágio');
    expect(botoes).toEqual([
      { id: 'adiant_confirmar', titulo: '✅ Confirmar' },
      { id: 'adiant_cancelar', titulo: '❌ Cancelar' },
    ]);
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_confirmacao_adiantamento',
      contexto: { adiantamento_dados: expect.objectContaining({ valor: 200 }) },
    }));
  });
});

describe('adiantamentoFlow — aguardando_confirmacao_adiantamento', () => {
  const sessaoComDados = () => makeSessao('aguardando_confirmacao_adiantamento', {
    adiantamento_dados: { tipo: 'pedagio', tipo_label: '⛽ Pedágio', valor: 200 },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('adiant_cancelar → mensagem cancelado + resetToMenu', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'botao', botaoId: 'adiant_cancelar' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('cancelado'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('adiant_confirmar → INSERT em adiantamentos com status=pendente + resetToMenu', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'botao', botaoId: 'adiant_confirmar' }), sessaoComDados());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0]).toMatchObject({
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      tipo: 'pedagio',
      valor: 200,
      status: 'pendente',
    });
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Pedido enviado'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('tipo inválido → reenvia botões', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'texto', texto: 'sim' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
  });

  it('INSERT falha → mensagem de erro, não chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'DB error', code: '500' } });
    await processarAdiantamentoFlow(makeMsg({ tipo: 'botao', botaoId: 'adiant_confirmar' }), sessaoComDados());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('confirmar sem dados no contexto → erro interno + resetToMenu', async () => {
    await processarAdiantamentoFlow(makeMsg({ tipo: 'botao', botaoId: 'adiant_confirmar' }), makeSessao('aguardando_confirmacao_adiantamento'));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro interno'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });
});

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
vi.mock('@/lib/whatsapp/messageParser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>('@/lib/whatsapp/messageParser');
  return { ...actual, getMediaUrl: vi.fn() };
});

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

import { processarImprevistoFlow } from '@/lib/whatsapp/flows/imprevistoFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes, enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Motorista', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}
function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return { id: 'sess-1', whatsapp: '5531999', motorista_id: 'mot-1', usuario_id: 'usr-1', empresa_id: 'emp-1', estado: estado as Sessao['estado'], contexto, ultimo_contato: new Date().toISOString() };
}

describe('imprevistoFlow — iniciar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('iniciar=true → lista de tipos + atualiza estado', async () => {
    await processarImprevistoFlow(makeMsg(), makeSessao('aguardando_acao'), true);
    expect(enviarMenuLista).toHaveBeenCalledOnce();
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_imprevisto_tipo' });
  });
});

describe('imprevistoFlow — aguardando_imprevisto_tipo', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != lista → pede seleção', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'texto', texto: 'transito' }), makeSessao('aguardando_imprevisto_tipo'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Selecione'));
  });

  it('"imp_transito" → salva tipo + envia lista de tempos', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'lista', listaId: 'imp_transito' }), makeSessao('aguardando_imprevisto_tipo'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_imprevisto_tempo',
      contexto: { imprevisto_dados: { tipo: 'transito', tipo_label: '🚦 Trânsito' } },
    }));
    expect(enviarMenuLista).toHaveBeenCalledOnce();
  });
});

describe('imprevistoFlow — aguardando_imprevisto_tempo', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != lista → pede tempo', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'texto', texto: '30 min' }), makeSessao('aguardando_imprevisto_tempo'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('tempo'));
  });

  it('"tempo_30" → salva tempo_estimado_min=30 + envia botões foto/pular', async () => {
    const sessao = makeSessao('aguardando_imprevisto_tempo', { imprevisto_dados: { tipo: 'transito' } });
    await processarImprevistoFlow(makeMsg({ tipo: 'lista', listaId: 'tempo_30' }), sessao);

    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_imprevisto_midia',
      contexto: { imprevisto_dados: expect.objectContaining({ tempo_estimado_min: 30, tempo_label: '30 min' }) },
    }));
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const botoes = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(botoes.some((b: { id: string }) => b.id === 'imp_pular')).toBe(true);
  });

  it('"tempo_nd" → tempo_estimado_min=null', async () => {
    const sessao = makeSessao('aguardando_imprevisto_tempo', { imprevisto_dados: { tipo: 'transito' } });
    await processarImprevistoFlow(makeMsg({ tipo: 'lista', listaId: 'tempo_nd' }), sessao);
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto;
    expect(ctx.imprevisto_dados.tempo_estimado_min).toBeNull();
  });
});

describe('imprevistoFlow — aguardando_imprevisto_midia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  const sessaoBase = () => makeSessao('aguardando_imprevisto_midia', {
    imprevisto_dados: { tipo: 'transito', tipo_label: '🚦 Trânsito', tempo_estimado_min: 30, tempo_label: '30 min' },
  });

  it('imp_pular → salva sem foto + mensagem de confirmação', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'botao', botaoId: 'imp_pular' }), sessaoBase());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0]).toMatchObject({
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      tipo: 'transito',
      duracao_estimada_min: 30,
    });
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Avisado'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('foto com mediaId → baixa URL, salva + confirmação', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/foto.jpg');
    await processarImprevistoFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), sessaoBase());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('texto livre → salva como observação + confirmação', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'texto', texto: 'acidente grave na pista' }), sessaoBase());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0].descricao).toBe('acidente grave na pista');
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('tipo inesperado → reenvia botão pular', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'documento' }), sessaoBase());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const botoes = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(botoes[0].id).toBe('imp_pular');
  });

  it('INSERT falha → mensagem de erro, não chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'DB error', code: '500' } });
    await processarImprevistoFlow(makeMsg({ tipo: 'botao', botaoId: 'imp_pular' }), sessaoBase());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('sem dados no contexto → erro interno + resetToMenu', async () => {
    await processarImprevistoFlow(makeMsg({ tipo: 'botao', botaoId: 'imp_pular' }), makeSessao('aguardando_imprevisto_midia'));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro interno'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });
});

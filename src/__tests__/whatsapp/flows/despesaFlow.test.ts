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
vi.mock('@/services/aiService', () => ({ lerCupomGenerico: vi.fn() }));
vi.mock('@/lib/whatsapp/messageParser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>('@/lib/whatsapp/messageParser');
  return { ...actual, getMediaUrl: vi.fn() };
});
vi.mock('@/lib/storage/r2', () => ({
  persistirMidiaNoR2: vi.fn().mockResolvedValue('https://r2.dev/despesa.jpg'),
  chaveMidia: vi.fn().mockReturnValue('key/emp/despesa.jpg'),
}));

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

import { processarDespesaFlow } from '@/lib/whatsapp/flows/despesaFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes, enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { lerCupomGenerico } from '@/services/aiService';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Motorista', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}
function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return { id: 'sess-1', whatsapp: '5531999', motorista_id: 'mot-1', usuario_id: 'usr-1', empresa_id: 'emp-1', estado: estado as Sessao['estado'], contexto, ultimo_contato: new Date().toISOString() };
}

describe('despesaFlow — iniciar', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('iniciar=true → envia lista de tipos + atualiza para aguardando_despesa_tipo', async () => {
    await processarDespesaFlow(makeMsg(), makeSessao('aguardando_acao'), true);
    expect(enviarMenuLista).toHaveBeenCalledOnce();
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_despesa_tipo' });
  });
});

describe('despesaFlow — aguardando_despesa_tipo', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != lista → pede seleção', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'texto', texto: 'pedagio' }), makeSessao('aguardando_despesa_tipo'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Selecione'));
  });

  it('lista válida "desp_pedagio" → salva tipo + pede foto', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'lista', listaId: 'desp_pedagio' }), makeSessao('aguardando_despesa_tipo'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_despesa_foto',
      contexto: { despesa_dados: { tipo: 'pedagio', tipo_label: '⛽ Pedágio' } },
    }));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('foto'));
  });
});

describe('despesaFlow — aguardando_despesa_foto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('texto com valor numérico → salva direto sem foto', async () => {
    const sessao = makeSessao('aguardando_despesa_foto', { veiculo_id: 'v-1', despesa_dados: { tipo: 'pedagio', tipo_label: '⛽ Pedágio' } });
    await processarDespesaFlow(makeMsg({ tipo: 'texto', texto: '18.50' }), sessao);
    expect(lerCupomGenerico).not.toHaveBeenCalled();
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('texto sem valor → pede foto/valor', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'texto', texto: 'foto do pedagio' }), makeSessao('aguardando_despesa_foto'));
    expect(lerCupomGenerico).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('foto'));
  });

  it('foto sem mediaUrl → pede valor manual', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await processarDespesaFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_despesa_foto'));
    expect(lerCupomGenerico).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledTimes(2);
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('valor');
  });

  it('foto OK, OCR falha → pede valor manual', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/cupom.jpg');
    (lerCupomGenerico as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    await processarDespesaFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_despesa_foto'));
    expect(enviarTexto).toHaveBeenCalledTimes(2);
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('valor');
  });

  it('foto OK, OCR sucesso → mostra resumo com botões + atualiza estado', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/cupom.jpg');
    (lerCupomGenerico as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { valor: 18.5, local: 'Auto Posto', descricao: 'Pedágio' } });
    const sessao = makeSessao('aguardando_despesa_foto', { despesa_dados: { tipo: 'pedagio' } });
    await processarDespesaFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), sessao);

    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const [, , texto, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('18,50');
    expect(texto).toContain('Auto Posto');
    expect(botoes).toEqual([
      { id: 'desp_confirmar', titulo: '✅ Confirmar' },
      { id: 'desp_corrigir', titulo: '✏️ Corrigir valor' },
    ]);
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ estado: 'aguardando_confirmacao_despesa' }));
  });
});

describe('despesaFlow — aguardando_confirmacao_despesa', () => {
  const sessaoComDados = () => makeSessao('aguardando_confirmacao_despesa', {
    veiculo_id: 'v-1',
    despesa_dados: { tipo: 'pedagio', valor: 18.5, local: 'Auto Posto' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('desp_confirmar → INSERT em despesas_veiculo + resetToMenu', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'botao', botaoId: 'desp_confirmar' }), sessaoComDados());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0]).toMatchObject({ tipo: 'pedagio', valor: 18.5, empresa_id: 'emp-1' });
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('desp_corrigir → pede valor, não salva', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'botao', botaoId: 'desp_corrigir' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('valor'));
  });

  it('texto com valor → atualiza dados + salva', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'texto', texto: '22,00' }), sessaoComDados());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0].valor).toBe(22.0);
  });

  it('INSERT falha → mensagem de erro, não chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'DB error', code: '500' } });
    await processarDespesaFlow(makeMsg({ tipo: 'botao', botaoId: 'desp_confirmar' }), sessaoComDados());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('sem despesa_dados → erro interno + resetToMenu', async () => {
    await processarDespesaFlow(makeMsg({ tipo: 'botao', botaoId: 'desp_confirmar' }), makeSessao('aguardando_confirmacao_despesa'));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro interno'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });
});

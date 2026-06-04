import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { Sessao } from '@/lib/whatsapp/sessionManager';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/whatsapp/messageSender', () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/menuHelper', () => ({
  enviarMenuBotoes: vi.fn().mockResolvedValue(true),
  enviarMenuLista: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/sessionManager', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/aiService', () => ({
  lerCupomAbastecimento: vi.fn(),
}));

vi.mock('@/lib/whatsapp/messageParser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>(
    '@/lib/whatsapp/messageParser'
  );
  return { ...actual, getMediaUrl: vi.fn() };
});

vi.mock('@/lib/storage/r2', () => ({
  persistirMidiaNoR2: vi.fn().mockResolvedValue('https://r2.dev/foto.jpg'),
  chaveMidia: vi.fn().mockReturnValue('key/emp/foto.jpg'),
}));

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

// ─── IMPORTS após mocks ──────────────────────────────────────────────────

import { processarAbastecimentoFlow } from '@/lib/whatsapp/flows/abastecimentoFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { lerCupomAbastecimento } from '@/services/aiService';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    from: '5531999',
    fromName: 'Motorista',
    messageId: 'wamid.x',
    timestamp: new Date(),
    tipo: 'texto',
    phoneNumberId: 'pnid',
    ...over,
  };
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

const ocrFake = { litros: 45.3, valor_total: 387.5, valor_litro: 8.56, posto: 'Shell' };

// ─── TESTES: aguardando_foto_abastecimento ───────────────────────────────

describe('abastecimentoFlow — aguardando_foto_abastecimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('tipo != foto → pede foto sem chamar IA', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'texto', texto: 'oi' }), makeSessao('aguardando_foto_abastecimento'));
    expect(lerCupomAbastecimento).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('foto');
  });

  it('foto sem mediaId → pede foto', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'foto' }), makeSessao('aguardando_foto_abastecimento'));
    expect(lerCupomAbastecimento).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it('foto com mediaId mas URL nula → pede nova foto', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await processarAbastecimentoFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_abastecimento'));
    expect(lerCupomAbastecimento).not.toHaveBeenCalled();
    // "Analisando..." + "Não consegui baixar"
    expect(enviarTexto).toHaveBeenCalledTimes(2);
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('Não consegui baixar');
  });

  it('foto OK, OCR falha → pede dados manuais + salva foto_url no contexto', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/foto.jpg');
    (lerCupomAbastecimento as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, motivo: 'timeout' });

    await processarAbastecimentoFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_abastecimento'));

    expect(enviarTexto).toHaveBeenCalledTimes(2);
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('Digite os dados');
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      contexto: expect.objectContaining({ foto_url: expect.any(String) }),
    }));
  });

  it('foto OK, OCR sucesso → mostra resumo com botões + atualiza estado', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/foto.jpg');
    (lerCupomAbastecimento as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: ocrFake });

    await processarAbastecimentoFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_abastecimento'));

    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const [sessId, para, texto, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sessId).toBe('sess-1');
    expect(para).toBe('5531999');
    expect(texto).toContain('45.3 litros');
    expect(texto).toContain('R$ 387,50');
    expect(texto).toContain('Shell');
    expect(botoes).toEqual([
      { id: 'abast_confirmar', titulo: '✅ Confirmar' },
      { id: 'abast_corrigir', titulo: '✏️ Corrigir' },
    ]);
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_confirmacao_abastecimento',
      contexto: expect.objectContaining({
        abastecimento_dados: expect.objectContaining({ litros: 45.3, valor_total: 387.5, posto: 'Shell' }),
      }),
    }));
  });
});

// ─── TESTES: aguardando_confirmacao_abastecimento ────────────────────────

describe('abastecimentoFlow — aguardando_confirmacao_abastecimento', () => {
  const sessaoComDados = () => makeSessao('aguardando_confirmacao_abastecimento', {
    veiculo_id: 'v-1',
    abastecimento_dados: { litros: 45.3, valor_total: 387.5, posto: 'Shell', foto_url: 'https://r2/x.jpg' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('botão abast_confirmar → INSERT em abastecimentos + resetToMenu', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'botao', botaoId: 'abast_confirmar' }), sessaoComDados());

    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    const insert = supabaseInsertMock.mock.calls[0][0];
    expect(insert).toMatchObject({
      veiculo_id: 'v-1',
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      litros: 45.3,
      valor_total: 387.5,
      posto: 'Shell',
    });
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('registrado'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('botão abast_corrigir → pede dados manuais, não salva', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'botao', botaoId: 'abast_corrigir' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Digite');
  });

  it('texto "45.3, 387.50, Shell" → parseia + salva', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'texto', texto: '45.3, 387.50, Shell' }), sessaoComDados());
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('texto inválido "abc" → mensagem de formato, não salva', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'texto', texto: 'abc' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Formato'));
  });

  it('tipo inesperado → reenvia botões', async () => {
    await processarAbastecimentoFlow(makeMsg({ tipo: 'documento' }), sessaoComDados());
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
  });

  it('INSERT falha → mensagem de erro, NÃO chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'DB down', code: '500' } });
    await processarAbastecimentoFlow(makeMsg({ tipo: 'botao', botaoId: 'abast_confirmar' }), sessaoComDados());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('confirmar sem veiculo_id no contexto → erro interno + resetToMenu', async () => {
    const sessao = makeSessao('aguardando_confirmacao_abastecimento', {
      abastecimento_dados: { litros: 10, valor_total: 80 },
    });
    await processarAbastecimentoFlow(makeMsg({ tipo: 'botao', botaoId: 'abast_confirmar' }), sessao);
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro interno'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });
});

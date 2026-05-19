import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { Sessao } from '@/lib/whatsapp/sessionManager';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/whatsapp/messageSender', () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
  enviarBotoes: vi.fn().mockResolvedValue(true),
  enviarLista: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/sessionManager', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/aiService', () => ({
  analisarAvaria: vi.fn(),
}));

vi.mock('@/lib/whatsapp/messageParser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>(
    '@/lib/whatsapp/messageParser'
  );
  return {
    ...actual,
    getMediaUrl: vi.fn(),
  };
});

const supabaseInsertMock = vi.fn();
const supabaseFromMock = vi.fn(() => ({ insert: supabaseInsertMock }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';
import { enviarTexto, enviarBotoes } from '@/lib/whatsapp/messageSender';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { analisarAvaria } from '@/services/aiService';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';

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

const analiseFake = {
  descricao: 'Pneu furado no eixo dianteiro',
  urgencia: 'alta' as const,
  recomendacao: 'Trocar o pneu antes de seguir viagem',
  confianca: 0.9,
};

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('avariaFlow — aguardando_avaria_midia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('foto → chama analisarAvaria({tipo:foto, url}) e envia botões de confirmação', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://media/url-foto.jpg');
    (analisarAvaria as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: analiseFake });

    const sessao = makeSessao('aguardando_avaria_midia', { veiculo_id: 'v-1' });
    await processarAvariaFlow(
      makeMsg({ tipo: 'foto', mediaId: 'media-foto-1' }),
      sessao
    );

    expect(getMediaUrl).toHaveBeenCalledWith('media-foto-1');
    expect(analisarAvaria).toHaveBeenCalledWith({ tipo: 'foto', url: 'https://media/url-foto.jpg' });

    // botão de confirmação enviado
    expect(enviarBotoes).toHaveBeenCalledOnce();
    const [para, texto, botoes] = (enviarBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(para).toBe('5531999');
    expect(texto).toContain('Avaria registrada');
    expect(texto).toContain('Pneu furado');
    expect(botoes).toEqual([
      { id: 'avaria_confirmar', titulo: '✅ Confirmar' },
      { id: 'avaria_foto', titulo: '📸 Adicionar foto' },
    ]);

    // estado atualizado para aguardando_confirmacao_avaria com avaria_dados
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_confirmacao_avaria',
      contexto: {
        avaria_dados: expect.objectContaining({
          descricao: 'Pneu furado no eixo dianteiro',
          urgencia: 'alta',
          recomendacao: 'Trocar o pneu antes de seguir viagem',
          foto_url: 'https://media/url-foto.jpg',
        }),
      },
    });
  });

  it('foto sem mediaUrl baixado → pede descrição por texto e não atualiza sessão', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await processarAvariaFlow(
      makeMsg({ tipo: 'foto', mediaId: 'media-foto-2' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(analisarAvaria).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
    // 1ª mensagem é "Analisando..." e 2ª é o fallback
    expect(enviarTexto).toHaveBeenCalledTimes(2);
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('Não consegui baixar a foto');
  });

  it('áudio → chama analisarAvaria({tipo:audio, url})', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://media/audio.ogg');
    (analisarAvaria as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { ...analiseFake, urgencia: 'media' as const } });

    await processarAvariaFlow(
      makeMsg({ tipo: 'audio', mediaId: 'media-audio-1' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(getMediaUrl).toHaveBeenCalledWith('media-audio-1');
    expect(analisarAvaria).toHaveBeenCalledWith({ tipo: 'audio', url: 'https://media/audio.ogg' });
    expect(enviarBotoes).toHaveBeenCalledOnce();
    expect(updateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ estado: 'aguardando_confirmacao_avaria' })
    );
  });

  it('áudio sem mediaUrl → pede descrição por texto', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await processarAvariaFlow(
      makeMsg({ tipo: 'audio', mediaId: 'audio-fail' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(analisarAvaria).not.toHaveBeenCalled();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[1][1]).toContain('Não consegui baixar o áudio');
  });

  it('texto → chama analisarAvaria({tipo:texto, texto})', async () => {
    (analisarAvaria as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { ...analiseFake, urgencia: 'baixa' as const } });

    await processarAvariaFlow(
      makeMsg({ tipo: 'texto', texto: 'pneu careca' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(getMediaUrl).not.toHaveBeenCalled();
    expect(analisarAvaria).toHaveBeenCalledWith({ tipo: 'texto', texto: 'pneu careca' });
    expect(enviarBotoes).toHaveBeenCalledOnce();
    expect(updateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        estado: 'aguardando_confirmacao_avaria',
        contexto: {
          avaria_dados: expect.objectContaining({ foto_url: null }),
        },
      })
    );
  });

  it('tipo inesperado (documento) → pede foto/áudio/texto e não chama IA', async () => {
    await processarAvariaFlow(
      makeMsg({ tipo: 'documento', mediaId: 'doc-1' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(analisarAvaria).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Mande uma');
  });

  it('IA falhando → mensagem amigável e não atualiza sessão', async () => {
    (analisarAvaria as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      fallbackManual: true,
      motivo: 'Erro na IA: timeout',
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'texto', texto: 'algo quebrou' }),
      makeSessao('aguardando_avaria_midia')
    );

    expect(analisarAvaria).toHaveBeenCalledOnce();
    expect(enviarBotoes).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Não consegui analisar');
  });
});

describe('avariaFlow — aguardando_confirmacao_avaria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('botão avaria_confirmar → INSERT em avarias + resetToMenu', async () => {
    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      veiculo_id: 'v-1',
      avaria_dados: {
        descricao: 'Pneu furado',
        urgencia: 'alta',
        recomendacao: 'Trocar',
        foto_url: 'https://media/x.jpg',
        ia_raw: { foo: 'bar' },
      },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'botao', botaoId: 'avaria_confirmar' }),
      sessao
    );

    expect(supabaseFromMock).toHaveBeenCalledWith('avarias');
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    const insertArg = supabaseInsertMock.mock.calls[0][0];
    expect(insertArg).toMatchObject({
      veiculo_id: 'v-1',
      motorista_id: 'mot-1',
      empresa_id: 'emp-1',
      descricao: 'Pneu furado',
      urgencia: 'alta',
      recomendacao_ia: 'Trocar',
      foto_url: 'https://media/x.jpg',
      status: 'aberta',
      origem: 'whatsapp',
    });
    expect(insertArg.ia_raw_response).toBe(JSON.stringify({ foo: 'bar' }));

    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Avaria registrada'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('confirmar sem veiculo_id no contexto → erro interno + reset', async () => {
    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      avaria_dados: { descricao: 'x', urgencia: 'baixa', recomendacao: 'y' },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'botao', botaoId: 'avaria_confirmar' }),
      sessao
    );

    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro interno'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('INSERT falhando → mensagem amigável e NÃO reseta sessão', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'DB error', code: '42P01' } });

    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      veiculo_id: 'v-1',
      avaria_dados: { descricao: 'x', urgencia: 'media', recomendacao: 'y' },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'botao', botaoId: 'avaria_confirmar' }),
      sessao
    );

    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro ao registrar avaria'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('botão avaria_foto → pede mais uma foto + volta para aguardando_avaria_midia', async () => {
    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      veiculo_id: 'v-1',
      avaria_dados: { descricao: 'x', urgencia: 'baixa', recomendacao: 'y' },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'botao', botaoId: 'avaria_foto' }),
      sessao
    );

    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Mande mais uma foto'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_avaria_midia' });
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('foto enviada diretamente na confirmação → reprocessa como mídia', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://media/foto2.jpg');
    (analisarAvaria as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: analiseFake });

    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      veiculo_id: 'v-1',
      avaria_dados: { descricao: 'x', urgencia: 'baixa', recomendacao: 'y' },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'foto', mediaId: 'media-foto-conf' }),
      sessao
    );

    expect(analisarAvaria).toHaveBeenCalledWith({ tipo: 'foto', url: 'https://media/foto2.jpg' });
    expect(enviarBotoes).toHaveBeenCalledOnce();
  });

  it('texto solto na confirmação → reapresenta botões', async () => {
    const sessao = makeSessao('aguardando_confirmacao_avaria', {
      veiculo_id: 'v-1',
      avaria_dados: { descricao: 'x', urgencia: 'baixa', recomendacao: 'y' },
    });

    await processarAvariaFlow(
      makeMsg({ tipo: 'texto', texto: 'qualquer coisa' }),
      sessao
    );

    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarBotoes).toHaveBeenCalledOnce();
    const [, texto, botoes] = (enviarBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('Use os botões');
    expect(botoes).toEqual([
      { id: 'avaria_confirmar', titulo: '✅ Confirmar' },
      { id: 'avaria_foto', titulo: '📸 Adicionar foto' },
    ]);
  });

  it('estado fora do switch (aguardando_acao) é ignorado silenciosamente', async () => {
    await processarAvariaFlow(
      makeMsg({ tipo: 'texto', texto: 'xx' }),
      makeSessao('aguardando_acao')
    );

    expect(analisarAvaria).not.toHaveBeenCalled();
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarBotoes).not.toHaveBeenCalled();
  });
});

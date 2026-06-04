import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('@/services/aiService', () => ({
  lerOdometro: vi.fn(),
}));

vi.mock('@/lib/whatsapp/messageParser', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>(
    '@/lib/whatsapp/messageParser'
  );
  return { ...actual, getMediaUrl: vi.fn() };
});

vi.mock('@/lib/storage/r2', () => ({
  persistirMidiaNoR2: vi.fn().mockResolvedValue('https://r2.dev/km.jpg'),
  chaveMidia: vi.fn().mockReturnValue('key/emp/km.jpg'),
}));

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

// ─── IMPORTS após mocks ──────────────────────────────────────────────────

import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { lerOdometro } from '@/services/aiService';
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

// ─── aguardando_foto_km ──────────────────────────────────────────────────

describe('kmFlow — aguardando_foto_km', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('texto com número válido → salva como manual, sem chamar IA', async () => {
    await processarKmFlow(
      makeMsg({ tipo: 'texto', texto: '125430' }),
      makeSessao('aguardando_foto_km', { veiculo_id: 'v-1' })
    );
    expect(lerOdometro).not.toHaveBeenCalled();
    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(supabaseInsertMock.mock.calls[0][0].km_lido).toBe(125430);
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('texto não-numérico → pede foto, não chama IA', async () => {
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: 'oi' }), makeSessao('aguardando_foto_km'));
    expect(lerOdometro).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('foto');
  });

  it('tipo != foto e != texto → pede foto', async () => {
    await processarKmFlow(makeMsg({ tipo: 'documento' }), makeSessao('aguardando_foto_km'));
    expect(lerOdometro).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it('foto sem mediaUrl → pede digitação manual + atualiza estado', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await processarKmFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_km'));
    expect(lerOdometro).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ estado: 'aguardando_km_manual' }));
  });

  it('foto OK, IA falha → pede digitação manual', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/painel.jpg');
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, motivo: 'timeout' });
    await processarKmFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_km'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ estado: 'aguardando_km_manual' }));
    expect(enviarMenuBotoes).not.toHaveBeenCalled();
  });

  it('foto OK, IA confiança >= 85 → mostra KM lido + botões confirmar/digitar', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/painel.jpg');
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { km: 125430, confianca: 92 } });
    await processarKmFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_km'));

    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const [, , texto, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('125');
    expect(botoes).toEqual([
      { id: 'km_confirmar', titulo: '✅ Confirmar' },
      { id: 'km_digitar', titulo: '✏️ Digitar manual' },
    ]);
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_confirmacao_km',
      contexto: expect.objectContaining({ km_lido: 125430, km_confianca: 92 }),
    }));
  });

  it('foto OK, IA confiança < 85 → pede digitação manual', async () => {
    (getMediaUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cdn/painel.jpg');
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { km: 99999, confianca: 70 } });
    await processarKmFlow(makeMsg({ tipo: 'foto', mediaId: 'mid-1' }), makeSessao('aguardando_foto_km'));
    expect(enviarMenuBotoes).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({ estado: 'aguardando_km_manual' }));
  });
});

// ─── aguardando_confirmacao_km ───────────────────────────────────────────

describe('kmFlow — aguardando_confirmacao_km', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('km_confirmar com km_lido → salva como ia_confirmado com ia_confianca preenchida', async () => {
    const sessao = makeSessao('aguardando_confirmacao_km', { veiculo_id: 'v-1', km_lido: 125430, km_confianca: 92 });
    await processarKmFlow(makeMsg({ tipo: 'botao', botaoId: 'km_confirmar' }), sessao);

    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    const ins = supabaseInsertMock.mock.calls[0][0];
    expect(ins.km_lido).toBe(125430);
    expect(ins.ia_confianca).toBe(92);
    expect(ins.ia_raw_response).toContain('125430');
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('km_confirmar sem km_lido no contexto → pede digitação manual', async () => {
    const sessao = makeSessao('aguardando_confirmacao_km', { veiculo_id: 'v-1' });
    await processarKmFlow(makeMsg({ tipo: 'botao', botaoId: 'km_confirmar' }), sessao);
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_km_manual' });
  });

  it('km_digitar → transição para aguardando_km_manual', async () => {
    await processarKmFlow(
      makeMsg({ tipo: 'botao', botaoId: 'km_digitar' }),
      makeSessao('aguardando_confirmacao_km', { veiculo_id: 'v-1' })
    );
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_km_manual' });
  });

  it('texto com número → salva como manual (ia_confianca=null, ia_raw=null)', async () => {
    const sessao = makeSessao('aguardando_confirmacao_km', { veiculo_id: 'v-1', km_lido: 125430, km_confianca: 92 });
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: '126000' }), sessao);
    const ins = supabaseInsertMock.mock.calls[0][0];
    expect(ins.km_lido).toBe(126000);
    expect(ins.ia_confianca).toBeNull();
    expect(ins.ia_raw_response).toBeNull();
  });

  it('tipo inválido → reenvia botões', async () => {
    await processarKmFlow(
      makeMsg({ tipo: 'foto', mediaId: 'x' }),
      makeSessao('aguardando_confirmacao_km', { veiculo_id: 'v-1' })
    );
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
  });
});

// ─── aguardando_km_manual ────────────────────────────────────────────────

describe('kmFlow — aguardando_km_manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('tipo != texto → pede digitação', async () => {
    await processarKmFlow(makeMsg({ tipo: 'foto' }), makeSessao('aguardando_km_manual', { veiculo_id: 'v-1' }));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it('texto inválido "abc" → mensagem de erro', async () => {
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: 'abc' }), makeSessao('aguardando_km_manual', { veiculo_id: 'v-1' }));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('número'));
  });

  it('"125.430" (ponto de milhar) → parseia para 125430 e salva', async () => {
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: '125.430' }), makeSessao('aguardando_km_manual', { veiculo_id: 'v-1' }));
    expect(supabaseInsertMock.mock.calls[0][0].km_lido).toBe(125430);
  });

  it('sem veiculo_id → mensagem de erro, não salva', async () => {
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: '125430' }), makeSessao('aguardando_km_manual'));
    expect(supabaseInsertMock).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('nenhum caminhão'));
  });

  it('INSERT falha por KM retroativo → mensagem específica, não chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'km_atual retroativ', code: 'P0001' } });
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: '100' }), makeSessao('aguardando_km_manual', { veiculo_id: 'v-1' }));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('menor'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });

  it('INSERT falha genérico → mensagem genérica, não chama resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'connection error', code: '500' } });
    await processarKmFlow(makeMsg({ tipo: 'texto', texto: '125430' }), makeSessao('aguardando_km_manual', { veiculo_id: 'v-1' }));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro ao salvar'));
    expect(resetToMenu).not.toHaveBeenCalled();
  });
});

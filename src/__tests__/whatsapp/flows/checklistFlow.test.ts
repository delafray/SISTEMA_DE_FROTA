import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { Sessao } from '@/lib/whatsapp/sessionManager';

vi.mock('@/lib/whatsapp/messageSender', () => ({ enviarTexto: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/whatsapp/menuHelper', () => ({ enviarMenuBotoes: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/whatsapp/sessionManager', () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

const supabaseInsertMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => ({ insert: supabaseInsertMock })) })),
}));

import { processarChecklistFlow } from '@/lib/whatsapp/flows/checklistFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Motorista', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}
function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return { id: 'sess-1', whatsapp: '5531999', motorista_id: 'mot-1', usuario_id: 'usr-1', empresa_id: 'emp-1', estado: estado as Sessao['estado'], contexto, ultimo_contato: new Date().toISOString() };
}

// Todas as respostas OK (6 itens)
function respostasTodasOk() {
  return { pneus: true, freios: true, farois: true, oleo_agua: true, triangulo_estepe: true, documentos: true };
}

describe('checklistFlow — iniciar', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('iniciar=true → atualiza sessão, envia boas-vindas e primeira pergunta', async () => {
    const sessao = makeSessao('aguardando_acao', { veiculo_placa: 'ABC1D23' });
    await processarChecklistFlow(makeMsg(), sessao, true);

    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_checklist',
      contexto: expect.objectContaining({ checklist_index: 0 }),
    }));
    // mensagem de boas-vindas + primeira pergunta (enviarMenuBotoes)
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('ABC1D23');
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    // primeira pergunta: item 1/6 PNEUS
    const [, , texto, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('1/6');
    expect(texto).toContain('PNEUS');
    expect(botoes[0].id).toBe('check_ok_0');
    expect(botoes[1].id).toBe('check_nok_0');
  });
});

describe('checklistFlow — aguardando_checklist (responder perguntas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseInsertMock.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('tipo != botao → reenvia a pergunta atual (não avança)', async () => {
    const sessao = makeSessao('aguardando_checklist', { checklist_index: 2, checklist_respostas: {} });
    await processarChecklistFlow(makeMsg({ tipo: 'texto', texto: 'sim' }), sessao);
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    const [, , texto] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(texto).toContain('3/6'); // índice 2 = pergunta 3
  });

  it('botão inválido → reenvia pergunta atual', async () => {
    const sessao = makeSessao('aguardando_checklist', { checklist_index: 0, checklist_respostas: {} });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'acao_km' }), sessao);
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
  });

  it('check_ok_0 → salva pneus=true + avança para próxima pergunta', async () => {
    const sessao = makeSessao('aguardando_checklist', { checklist_index: 0, checklist_respostas: {} });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_ok_0' }), sessao);

    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      contexto: expect.objectContaining({
        checklist_index: 1,
        checklist_respostas: expect.objectContaining({ pneus: true }),
      }),
    }));
    expect(enviarMenuBotoes).toHaveBeenCalledOnce(); // próxima pergunta
  });

  it('check_nok_1 → salva freios=false + avança para próxima pergunta', async () => {
    const sessao = makeSessao('aguardando_checklist', { checklist_index: 1, checklist_respostas: { pneus: true } });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_nok_1' }), sessao);

    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      contexto: expect.objectContaining({
        checklist_index: 2,
        checklist_respostas: expect.objectContaining({ pneus: true, freios: false }),
      }),
    }));
  });

  it('último item respondido → finaliza, salva no banco, mensagem de tudo certo', async () => {
    const sessao = makeSessao('aguardando_checklist', {
      veiculo_id: 'v-1',
      checklist_index: 5, // último item (documentos)
      checklist_respostas: { pneus: true, freios: true, farois: true, oleo_agua: true, triangulo_estepe: true },
    });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_ok_5' }), sessao);

    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    const insert = supabaseInsertMock.mock.calls[0][0];
    expect(insert.veiculo_id).toBe('v-1');
    expect(insert.motorista_id).toBe('mot-1');
    expect(insert.respostas).toMatchObject({ ...respostasTodasOk() });
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Tudo certo'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('último item com problema → mensagem com lista de problemas', async () => {
    const sessao = makeSessao('aguardando_checklist', {
      veiculo_id: 'v-1',
      checklist_index: 5,
      checklist_respostas: { pneus: false, freios: true, farois: true, oleo_agua: true, triangulo_estepe: true },
    });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_nok_5' }), sessao);

    expect(supabaseInsertMock).toHaveBeenCalledOnce();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('problema'));
    // PNEUS e DOCUMENTOS marcados com problema
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('PNEUS');
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('INSERT com erro 23505 (checklist já feito hoje) → mensagem específica + resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { code: '23505', message: 'unique violation' } });
    const sessao = makeSessao('aguardando_checklist', {
      veiculo_id: 'v-1',
      checklist_index: 5,
      checklist_respostas: { pneus: true, freios: true, farois: true, oleo_agua: true, triangulo_estepe: true },
    });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_ok_5' }), sessao);

    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('já foi feito hoje'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  it('INSERT com erro genérico → mensagem de erro + resetToMenu', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { code: '500', message: 'connection error' } });
    const sessao = makeSessao('aguardando_checklist', {
      veiculo_id: 'v-1',
      checklist_index: 5,
      checklist_respostas: { pneus: true, freios: true, farois: true, oleo_agua: true, triangulo_estepe: true },
    });
    await processarChecklistFlow(makeMsg({ tipo: 'botao', botaoId: 'check_ok_5' }), sessao);

    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Erro'));
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });
});

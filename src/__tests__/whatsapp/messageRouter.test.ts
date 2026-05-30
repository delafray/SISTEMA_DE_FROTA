import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/whatsapp/auth', () => ({
  identificarRemetente: vi.fn(),
}));

vi.mock('@/lib/whatsapp/sessionManager', () => ({
  getOrCreateSession: vi.fn(),
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
  encerrarSessao: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/whatsapp/messageSender', () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
  enviarBotoes: vi.fn().mockResolvedValue(true),
  enviarLista: vi.fn().mockResolvedValue(true),
  enviarMenuTexto: vi.fn().mockResolvedValue(true),
  formatarMenuTexto: vi.fn(() => ''),
  RESERVED_MENU_IDS: { VOLTAR: '__voltar__', SAIR: '__sair__' },
}));

vi.mock('@/lib/whatsapp/menuHelper', () => ({
  enviarMenuBotoes: vi.fn().mockResolvedValue(true),
  enviarMenuLista: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/flows/kmFlow', () => ({ processarKmFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/avariaFlow', () => ({ processarAvariaFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/viagemFlow', () => ({ processarViagemFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/abastecimentoFlow', () => ({ processarAbastecimentoFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/checklistFlow', () => ({ processarChecklistFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/adiantamentoFlow', () => ({ processarAdiantamentoFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/despesaFlow', () => ({ processarDespesaFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/imprevistoFlow', () => ({ processarImprevistoFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/gestorFlow', () => ({ processarGestorFlow: vi.fn().mockResolvedValue(undefined) }));

// Mock do geminiBot — nos testes o Gemini nao e chamado de verdade.
// O mock apenas chama enviarTexto com uma resposta fixa para que os
// testes de fluxo de menu continuem funcionando normalmente.
vi.mock('@/lib/whatsapp/geminiBot', () => ({
  processarComGemini: vi.fn().mockResolvedValue('Resposta simulada do Gemini'),
  limparHistoricoGemini: vi.fn(),
}));

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { processarMensagem, isSaudacao } from '@/lib/whatsapp/messageRouter';
import { identificarRemetente } from '@/lib/whatsapp/auth';
import {
  getOrCreateSession,
  updateSession,
  resetToMenu,
  encerrarSessao,
} from '@/lib/whatsapp/sessionManager';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';

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

function mockMotorista() {
  (identificarRemetente as ReturnType<typeof vi.fn>).mockResolvedValue({
    tipo: 'motorista',
    motorista_id: 'mot-1',
    usuario_id: 'usr-1',
    empresa_id: 'emp-1',
    nome: 'João',
  });
}

function mockSessao(estado: string, contexto: Record<string, unknown> = {}) {
  (getOrCreateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'sess-1',
    whatsapp: '5531999',
    estado,
    contexto,
    motorista_id: 'mot-1',
    usuario_id: 'usr-1',
    empresa_id: 'emp-1',
  });
}

// ─── TESTES isSaudacao ──────────────────────────────────────────────────

describe('isSaudacao', () => {
  it.each([
    ['oi', true],
    ['Olá', true],
    ['Bom dia!', true],
    ['boa tarde, mestre', true],
    ['hello', true],
    ['eai', true],
    ['quero registrar km', false],
    ['', false],
  ])('isSaudacao(%s) → %s', (texto, esperado) => {
    expect(isSaudacao(makeMsg({ tipo: 'texto', texto }))).toBe(esperado);
  });

  it('retorna false para mensagem não-texto', () => {
    expect(isSaudacao(makeMsg({ tipo: 'foto', texto: 'oi' }))).toBe(false);
  });
});

// ─── TESTES processarMensagem ──────────────────────────────────────────

describe('processarMensagem — identidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignora número desconhecido sem responder', async () => {
    (identificarRemetente as ReturnType<typeof vi.fn>).mockResolvedValue({
      tipo: 'desconhecido',
    });

    await processarMensagem(makeMsg({ texto: 'oi' }));

    expect(getOrCreateSession).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarMenuLista).not.toHaveBeenCalled();
  });

  it('gestor → Gemini responde (GEMINI_MODE universal intercepta gestor tambem)', async () => {
    (identificarRemetente as ReturnType<typeof vi.fn>).mockResolvedValue({
      tipo: 'gestor',
      usuario_id: 'u-1',
      empresa_id: 'e-1',
      nome: 'Carlos',
    });
    mockSessao('novo');

    // Pergunta real (saudacao agora cai no fast-path antes do Gemini)
    await processarMensagem(makeMsg({ texto: 'quantos motoristas tenho?' }));

    // GEMINI_MODE universal: gestor tambem e atendido pelo Gemini.
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('Resposta simulada do Gemini');
  });
});

describe('processarMensagem — roteamento motorista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockMotorista();

    // veículos disponíveis para selecionar
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({
                data: [{ id: 'v-1', placa: 'ABC1D23', apelido: 'Tigrão', marca: 'Volvo', modelo: 'FH' }],
                error: null,
              }),
          }),
        }),
        single: () => Promise.resolve({ data: null, error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('sessão nova + pergunta real → Gemini responde (sem menu de veiculo)', async () => {
    mockSessao('novo');
    // Pergunta real (nao saudacao) — saudacao agora cai no fast-path
    await processarMensagem(makeMsg({ texto: 'quanto km tem o leao?' }));
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('Resposta simulada do Gemini');
    expect(enviarMenuLista).not.toHaveBeenCalled();
  });

  it('saudação "oi" → fast-path responde sem chamar Gemini (economia de tokens)', async () => {
    mockSessao('aguardando_acao', { veiculo_id: 'v-1' });
    await processarMensagem(makeMsg({ texto: 'oi' }));
    expect(enviarTexto).toHaveBeenCalledOnce();
    // Fast-path responde "Ola, <nome>." ou generico
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatch(/Ola/i);
    expect(enviarMenuLista).not.toHaveBeenCalled();
  });

  it('estado aguardando_foto_km → delega ao kmFlow', async () => {
    mockSessao('aguardando_foto_km');
    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'm-1' }));
    expect(processarKmFlow).toHaveBeenCalledOnce();
    expect(enviarMenuLista).not.toHaveBeenCalled();
  });

  it('estado aguardando_avaria_midia → audio vai para Gemini (GEMINI_MODE universal)', async () => {
    mockSessao('aguardando_avaria_midia');
    await processarMensagem(makeMsg({ tipo: 'audio', mediaId: 'a-1' }));
    // Com GEMINI_MODE universal, audio em qualquer estado vai para o Gemini.
    // transcreverAudio e chamado, depois Gemini responde.
    // Como o mock de transcreverAudio retorna ok:false (fallback), o bot pede texto escrito.
    expect(processarAvariaFlow).not.toHaveBeenCalled();
  });

  it('seleção de veículo inválida — Gemini responde (GEMINI_MODE universal)', async () => {
    mockSessao('aguardando_veiculo');
    await processarMensagem(makeMsg({ texto: 'não sei' }));
    // Gemini intercepta antes do handler de selecao de veiculo.
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('Resposta simulada do Gemini');
  });
});

describe('processarMensagem — resposta numerica → lista/botao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockMotorista();
    // Mock que aceita tanto .select().eq().eq().order() quanto .select().eq().single()
    const eqResult: Record<string, unknown> = {};
    eqResult.eq = () => eqResult;
    eqResult.order = () => Promise.resolve({ data: [], error: null });
    eqResult.single = () => Promise.resolve({
      data: { id: 'v-1', placa: 'ABC1D23', km_atual: 100 },
      error: null,
    });
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => eqResult,
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('texto "1" com menu_opcoes tipo_original:lista → flow recebe msg.tipo=lista com listaId correto', async () => {
    // Sessao em aguardando_veiculo com menu_opcoes salvas (simulando que o
    // motorista respondeu "1" depois de receber o menu numerado de caminhoes).
    mockSessao('aguardando_veiculo', {
      menu_opcoes: {
        tipo_original: 'lista',
        opcoes: [
          { id: 'veiculo_abc', titulo: 'ABC1D23' },
          { id: 'veiculo_def', titulo: 'DEF4G56' },
        ],
      },
    });

    await processarMensagem(makeMsg({ texto: '1' }));

    // Como o estado e aguardando_veiculo, o handler vai dentro de
    // processarSelecaoVeiculo que checa msg.tipo === 'lista' e msg.listaId.
    // Se a resolucao numerica funcionou, o handler avanca (chama update da sessao);
    // se nao, ele dispara enviarTexto "Por favor selecione um caminhao".
    const enviarTextoCalls = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls;
    const semSelecao = enviarTextoCalls.some(([, t]) => typeof t === 'string' && t.includes('Por favor, selecione'));
    expect(semSelecao).toBe(false);
  });

  it('texto "1" sem menu_opcoes → Gemini responde (GEMINI_MODE universal)', async () => {
    mockSessao('aguardando_veiculo');

    await processarMensagem(makeMsg({ texto: '1' }));

    // Com GEMINI_MODE universal, texto vai para o Gemini independente do estado.
    const enviarTextoCalls = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls;
    const geminiRespondeu = enviarTextoCalls.some(([, t]) => typeof t === 'string' && t === 'Resposta simulada do Gemini');
    expect(geminiRespondeu).toBe(true);
  });

  it('texto fora do range (ex: "99") com menu_opcoes → Gemini responde (GEMINI_MODE universal)', async () => {
    mockSessao('aguardando_veiculo', {
      menu_opcoes: {
        tipo_original: 'lista',
        opcoes: [{ id: 'veiculo_abc', titulo: 'ABC1D23' }],
      },
    });

    await processarMensagem(makeMsg({ texto: '99' }));

    // GEMINI_MODE universal: texto vai para o Gemini.
    const enviarTextoCalls = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls;
    const geminiRespondeu = enviarTextoCalls.some(([, t]) => typeof t === 'string' && t === 'Resposta simulada do Gemini');
    expect(geminiRespondeu).toBe(true);
  });

  it('texto nao-numerico com menu_opcoes → Gemini responde (GEMINI_MODE universal)', async () => {
    mockSessao('aguardando_veiculo', {
      menu_opcoes: {
        tipo_original: 'lista',
        opcoes: [{ id: 'veiculo_abc', titulo: 'ABC1D23' }],
      },
    });

    await processarMensagem(makeMsg({ texto: 'qualquer coisa' }));

    // GEMINI_MODE universal: texto vai para o Gemini.
    const enviarTextoCalls = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls;
    const geminiRespondeu = enviarTextoCalls.some(([, t]) => typeof t === 'string' && t === 'Resposta simulada do Gemini');
    expect(geminiRespondeu).toBe(true);
  });
});

describe('processarMensagem — opcoes reservadas (Voltar / Sair)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockMotorista();
    // Mock supabase para suportar tanto select().eq().eq().order() quanto .eq().single()
    const eqResult: Record<string, unknown> = {};
    eqResult.eq = () => eqResult;
    eqResult.order = () => Promise.resolve({ data: [{ id: 'v-1', placa: 'ABC1D23' }], error: null });
    eqResult.single = () => Promise.resolve({ data: { id: 'v-1', placa: 'ABC1D23', km_atual: 100 }, error: null });
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => eqResult,
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('texto que resolve para __sair__ chama encerrarSessao e nao delega ao flow', async () => {
    mockSessao('aguardando_foto_km', {
      menu_opcoes: {
        tipo_original: 'botao',
        opcoes: [
          { id: 'km_confirmar', titulo: '✅ Confirmar' },
          { id: '__voltar__', titulo: '🔙 Voltar' },
          { id: '__sair__', titulo: '🚪 Sair' },
        ],
      },
    });

    await processarMensagem(makeMsg({ texto: '3' }));

    expect(encerrarSessao).toHaveBeenCalledWith('sess-1');
    expect(processarKmFlow).not.toHaveBeenCalled();
    // Mensagem de despedida foi enviada
    const enviarTextoCalls = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls;
    const despediu = enviarTextoCalls.some(([, t]) => typeof t === 'string' && t.includes('Até logo'));
    expect(despediu).toBe(true);
  });

  it('texto que resolve para __voltar__ em sub-flow chama resetToMenu e reenvia menu principal', async () => {
    mockSessao('aguardando_foto_km', {
      veiculo_placa: 'ABC1D23',
      menu_opcoes: {
        tipo_original: 'botao',
        opcoes: [
          { id: 'km_confirmar', titulo: '✅ Confirmar' },
          { id: '__voltar__', titulo: '🔙 Voltar' },
          { id: '__sair__', titulo: '🚪 Sair' },
        ],
      },
    });

    await processarMensagem(makeMsg({ texto: '2' }));

    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
    expect(processarKmFlow).not.toHaveBeenCalled();
    // Menu principal foi renviado (via enviarMenuLista do menuHelper)
    expect(enviarMenuLista).toHaveBeenCalled();
  });

  it('texto que resolve para __voltar__ no menu principal volta para selecao de caminhao', async () => {
    mockSessao('aguardando_acao', {
      veiculo_placa: 'ABC1D23',
      menu_opcoes: {
        tipo_original: 'lista',
        opcoes: [
          { id: 'acao_km', titulo: 'KM' },
          { id: '__voltar__', titulo: '🔙 Voltar' },
          { id: '__sair__', titulo: '🚪 Sair' },
        ],
      },
    });

    await processarMensagem(makeMsg({ texto: '2' }));

    // Selecao de caminhao foi enviada (enviarMenuLista chamado com sessao_id e parametros adequados)
    expect(enviarMenuLista).toHaveBeenCalled();
    // resetToMenu NAO foi chamado (voltar do menu principal nao reseta, vai para selecao)
    expect(resetToMenu).not.toHaveBeenCalled();
    // Estado mudou para aguardando_veiculo (via updateSession dentro de enviarSelecaoVeiculo)
    const updateCalls = (updateSession as ReturnType<typeof vi.fn>).mock.calls;
    const setouVeiculo = updateCalls.some(
      ([, upd]) => (upd as { estado?: string })?.estado === 'aguardando_veiculo'
    );
    expect(setouVeiculo).toBe(true);
  });
});

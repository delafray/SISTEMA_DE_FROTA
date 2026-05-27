/**
 * E2E — Cobertura das transições de estado do bot WhatsApp.
 *
 * Cada teste simula uma mensagem entrando pelo `processarMensagem`
 * e verifica:
 *   1. Qual mensagem foi enviada (mock de messageSender).
 *   2. Como a sessão evoluiu (mock de sessionManager.updateSession).
 *
 * Diferente do `messageRouter.test.ts`, aqui não mockamos os flows —
 * deixamos o código real do `kmFlow` rodar (mockando só as folhas:
 * aiService.lerOdometro, getMediaUrl, supabase).
 */

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

// messageParser exporta `getMediaUrl` que kmFlow chama — mockamos só a função,
// preservando o resto do módulo (ParsedMessage type, parseWebhookPayload, etc.).
vi.mock('@/lib/whatsapp/messageParser', async () => {
  const real = await vi.importActual<typeof import('@/lib/whatsapp/messageParser')>(
    '@/lib/whatsapp/messageParser'
  );
  return {
    ...real,
    getMediaUrl: vi.fn().mockResolvedValue('https://meta.cdn/fake-photo.jpg'),
  };
});

vi.mock('@/services/aiService', () => ({
  lerOdometro: vi.fn(),
  lerCupom: vi.fn(),
  analisarAvaria: vi.fn(),
  transcreverAudio: vi.fn().mockResolvedValue({ ok: false, fallbackManual: true, motivo: 'mock' }),
  classificarMidia: vi.fn().mockResolvedValue({ ok: false, fallbackManual: true, motivo: 'mock' }),
  classificarIntentTexto: vi.fn().mockResolvedValue({ ok: false, fallbackManual: true, motivo: 'mock' }),
  extrairPedidoFrete: vi.fn(),
}));

// Builder mockável de Supabase — cada teste sobrescreve via supabaseFromMock.
const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { processarMensagem } from '@/lib/whatsapp/messageRouter';
import { identificarRemetente } from '@/lib/whatsapp/auth';
import { getOrCreateSession, updateSession, resetToMenu } from '@/lib/whatsapp/sessionManager';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes, enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { lerOdometro } from '@/services/aiService';

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
    ultimo_contato: new Date().toISOString(),
  });
}

/**
 * Builder de Supabase: lista de veículos da empresa.
 */
function supabaseComVeiculos() {
  supabaseFromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  id: 'v-1',
                  placa: 'ABC1D23',
                  apelido: 'Tigrão',
                  marca: 'Volvo',
                  modelo: 'FH',
                },
              ],
              error: null,
            }),
        }),
      }),
    }),
  });
}

/**
 * Builder de Supabase para "selecionei veículo v-1":
 * .from('veiculos').select(...).eq('id', ...).single() retorna o veículo.
 */
function supabaseSelecionandoVeiculo() {
  supabaseFromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: { id: 'v-1', placa: 'ABC1D23', km_atual: 100000 },
            error: null,
          }),
      }),
    }),
  });
}

/**
 * Builder para salvarKm (kmFlow):
 *   - .from('fretes').select().eq().eq().maybeSingle() → null (sem frete ativo)
 *   - .from('km_logs').insert() → { error: null }
 */
function supabaseSalvandoKm(insertError: { message: string } | null = null) {
  supabaseFromMock.mockImplementation((tabela: string) => {
    if (tabela === 'fretes') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };
    }
    if (tabela === 'km_logs') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertError }),
      };
    }
    return {};
  });
}

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('E2E WhatsApp Bot — Transições de estado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMotorista();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. "Oi" → seleção de veículo ─────────────────────────────────────

  it('1) motorista manda "oi" em sessão nova → envia lista de caminhões e estado vai pra aguardando_veiculo', async () => {
    mockSessao('novo');
    supabaseComVeiculos();

    await processarMensagem(makeMsg({ texto: 'oi' }));

    expect(enviarMenuLista).toHaveBeenCalledOnce();
    const [sessionId, para, corpo, opcoes] = (enviarMenuLista as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sessionId).toBe('sess-1');
    expect(para).toBe('5531999');
    expect(corpo).toContain('João');
    expect(corpo).toContain('caminhão');
    // Apos o refactor, as opcoes sao um array flat (sem secoes)
    expect(opcoes[0]).toMatchObject({
      id: 'veiculo_v-1',
      titulo: 'ABC1D23',
    });
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_veiculo',
    });
  });

  // ─── 2. Seleção de veículo válida ─────────────────────────────────────

  it('2) responde com lista veiculo_<uuid> → estado vai pra aguardando_acao com veiculo_id no contexto', async () => {
    mockSessao('aguardando_veiculo');
    supabaseSelecionandoVeiculo();

    await processarMensagem(
      makeMsg({ tipo: 'lista', listaId: 'veiculo_v-1', listaTitulo: 'ABC1D23' })
    );

    // updateSession foi chamada com estado=aguardando_acao + contexto novo
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_acao',
      contexto: {
        veiculo_id: 'v-1',
        veiculo_placa: 'ABC1D23',
      },
    });
    // depois o menu de ações é enviado (uma chamada de enviarMenuLista)
    expect(enviarMenuLista).toHaveBeenCalledOnce();
    // Nova assinatura: (sessionId, para, corpo, opcoes, rodape?) → corpo é o índice 2
    const corpo = (enviarMenuLista as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(corpo).toContain('ABC1D23');
  });

  // ─── 3. Seleção de veículo inválida ───────────────────────────────────

  it('3) texto em aguardando_veiculo → bot pede pra selecionar da lista', async () => {
    mockSessao('aguardando_veiculo');

    await processarMensagem(makeMsg({ texto: 'não sei qual' }));

    expect(enviarTexto).toHaveBeenCalledOnce();
    const [para, txt] = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(para).toBe('5531999');
    expect(txt.toLowerCase()).toContain('lista');
    // não muda estado
    expect(updateSession).not.toHaveBeenCalled();
  });

  // ─── 4. Menu "Informar KM" ────────────────────────────────────────────

  it('4) acao_km em aguardando_acao → pede foto e estado vira aguardando_foto_km', async () => {
    mockSessao('aguardando_acao', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });

    await processarMensagem(makeMsg({ tipo: 'lista', listaId: 'acao_km' }));

    expect(enviarTexto).toHaveBeenCalledOnce();
    const [, txt] = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(txt.toLowerCase()).toContain('foto');
    expect(txt.toLowerCase()).toContain('odômetro');
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_foto_km',
    });
  });

  // ─── 5. KM via foto, IA confiante ─────────────────────────────────────

  it('5) foto em aguardando_foto_km + IA confiante (95%) → botões de confirmar + estado aguardando_confirmacao_km', async () => {
    mockSessao('aguardando_foto_km', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { km: 185000, confianca: 95, observacao: 'painel nítido' },
    });

    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'm-1' }));

    expect(lerOdometro).toHaveBeenCalledOnce();
    // primeiro enviarTexto = "Analisando..."
    expect(enviarTexto).toHaveBeenCalled();
    // depois enviarMenuBotoes com confirmação
    expect(enviarMenuBotoes).toHaveBeenCalledOnce();
    // Nova assinatura: (sessionId, para, corpo, opcoes)
    const [sessionId, para, corpo, botoes] = (enviarMenuBotoes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sessionId).toBe('sess-1');
    expect(para).toBe('5531999');
    expect(corpo).toContain('185.000');
    expect(botoes.map((b: { id: string }) => b.id)).toEqual([
      'km_confirmar',
      'km_digitar',
    ]);
    // updateSession com km_lido no contexto + estado certo
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_confirmacao_km',
      contexto: expect.objectContaining({
        km_lido: 185000,
        km_confianca: 95,
        foto_url: 'https://meta.cdn/fake-photo.jpg',
      }),
    });
  });

  // ─── 6. KM via foto, IA NÃO-confiante ─────────────────────────────────

  it('6) foto em aguardando_foto_km + IA pouco confiante (50%) → pede digitação manual', async () => {
    mockSessao('aguardando_foto_km', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { km: 123, confianca: 50, observacao: 'imagem borrada' },
    });

    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'm-2' }));

    expect(lerOdometro).toHaveBeenCalledOnce();
    expect(enviarMenuBotoes).not.toHaveBeenCalled();
    const mensagens = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    // a última mensagem deve pedir digitação manual
    expect(mensagens.some((m: string) => m.toLowerCase().includes('digite'))).toBe(true);
    expect(mensagens.some((m: string) => m.includes('50'))).toBe(true);
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_km_manual',
      contexto: expect.objectContaining({ foto_url: 'https://meta.cdn/fake-photo.jpg' }),
    });
  });

  // ─── 7. KM via foto, IA falha ─────────────────────────────────────────

  it('7) foto em aguardando_foto_km + IA falha (ok:false) → fallback manual', async () => {
    mockSessao('aguardando_foto_km', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });
    (lerOdometro as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      fallbackManual: true,
      motivo: 'OpenAI timeout',
    });

    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'm-3' }));

    expect(lerOdometro).toHaveBeenCalledOnce();
    expect(enviarMenuBotoes).not.toHaveBeenCalled();
    const mensagens = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    // fallback explicitamente pede digitação
    expect(mensagens.some((m: string) => m.toLowerCase().includes('digite'))).toBe(true);
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_km_manual',
    });
  });

  // ─── 8. Confirmação KM com botão ──────────────────────────────────────

  it('8) botão km_confirmar em aguardando_confirmacao_km → grava em km_logs e reseta para menu', async () => {
    mockSessao('aguardando_confirmacao_km', {
      veiculo_id: 'v-1',
      veiculo_placa: 'ABC1D23',
      km_lido: 185000,
      km_confianca: 95,
      foto_url: 'https://meta.cdn/fake-photo.jpg',
    });

    let kmLogsInsert: ReturnType<typeof vi.fn> | null = null;
    supabaseFromMock.mockImplementation((tabela: string) => {
      if (tabela === 'fretes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (tabela === 'km_logs') {
        kmLogsInsert = vi.fn().mockResolvedValue({ error: null });
        return { insert: kmLogsInsert };
      }
      return {};
    });

    await processarMensagem(makeMsg({ tipo: 'botao', botaoId: 'km_confirmar' }));

    // gravou o km
    expect(kmLogsInsert).not.toBeNull();
    expect(kmLogsInsert).toHaveBeenCalledOnce();
    const payload = (kmLogsInsert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({
      veiculo_id: 'v-1',
      km_lido: 185000,
      tipo: 'informado',
    });
    // confirmação ao motorista
    const ultMsg = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1];
    expect(ultMsg).toContain('185.000');
    // resetToMenu chamado (volta ao menu)
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  // ─── 9. KM manual via texto ───────────────────────────────────────────

  it('9) texto "185000" em aguardando_km_manual → grava km_logs e reseta', async () => {
    mockSessao('aguardando_km_manual', {
      veiculo_id: 'v-1',
      veiculo_placa: 'ABC1D23',
      foto_url: 'https://meta.cdn/fake-photo.jpg',
    });
    let kmLogsInsert: ReturnType<typeof vi.fn> | null = null;
    supabaseFromMock.mockImplementation((tabela: string) => {
      if (tabela === 'fretes') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (tabela === 'km_logs') {
        kmLogsInsert = vi.fn().mockResolvedValue({ error: null });
        return { insert: kmLogsInsert };
      }
      return {};
    });

    await processarMensagem(makeMsg({ tipo: 'texto', texto: '185000' }));

    expect(kmLogsInsert).not.toBeNull();
    expect(kmLogsInsert).toHaveBeenCalledOnce();
    const payload = (kmLogsInsert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({
      veiculo_id: 'v-1',
      km_lido: 185000,
      tipo: 'informado',
    });
    expect(resetToMenu).toHaveBeenCalledWith('sess-1');
  });

  // ─── 10. Saudação reseta fluxo ────────────────────────────────────────

  it('10) "oi" em aguardando_acao → volta para seleção de veículo (saudação detectada)', async () => {
    mockSessao('aguardando_acao', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });
    supabaseComVeiculos();

    await processarMensagem(makeMsg({ texto: 'oi' }));

    expect(enviarMenuLista).toHaveBeenCalledOnce();
    // Nova assinatura: (sessionId, para, corpo, opcoes, rodape?) → corpo é o índice 2
    const corpo = (enviarMenuLista as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(corpo).toContain('caminhão');
    expect(updateSession).toHaveBeenCalledWith('sess-1', {
      estado: 'aguardando_veiculo',
    });
  });

  // ─── 11. Mídia solta em aguardando_acao (Smart Intent Router) ─────────

  // OBS: Quando a task foi escrita, o Smart Intent Router ainda não tinha sido
  // implementado. Hoje ele EXISTE em messageRouter.ts (smartRouterFoto):
  // foto solta → getMediaUrl → classificarMidia → roteia ou fallback de menu.
  // Aqui asseguramos que, com classificarMidia em modo fallback,
  // o motorista é redirecionado ao menu sem mudança de estado e sem chamar kmFlow.
  it('11) foto em aguardando_acao (sem flow ativo) → Smart Router classifica; em fallback remostra menu', async () => {
    mockSessao('aguardando_acao', { veiculo_id: 'v-1', veiculo_placa: 'ABC1D23' });

    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'mx' }));

    // Não delega ao kmFlow (lerOdometro não é chamada)
    expect(lerOdometro).not.toHaveBeenCalled();
    // 2 textos: "Analisando..." e "Não consegui entender..."
    const textos = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(textos.some((t: string) => t.toLowerCase().includes('analisando'))).toBe(true);
    expect(textos.some((t: string) => t.toLowerCase().includes('não consegui'))).toBe(true);
    // Menu re-enviado
    expect(enviarMenuLista).toHaveBeenCalledOnce();
    // Nova assinatura: (sessionId, para, corpo, opcoes, rodape?) → corpo é o índice 2
    const corpoMenu = (enviarMenuLista as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(corpoMenu).toContain('ABC1D23');
    // Sem mudança de estado
    expect(updateSession).not.toHaveBeenCalled();
  });

  // ─── 12. Número desconhecido ──────────────────────────────────────────

  it('12) identificarRemetente retorna desconhecido → nada é enviado', async () => {
    (identificarRemetente as ReturnType<typeof vi.fn>).mockResolvedValue({
      tipo: 'desconhecido',
    });

    await processarMensagem(makeMsg({ texto: 'oi' }));

    expect(getOrCreateSession).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarMenuLista).not.toHaveBeenCalled();
    expect(enviarMenuBotoes).not.toHaveBeenCalled();
    expect(updateSession).not.toHaveBeenCalled();
  });
});

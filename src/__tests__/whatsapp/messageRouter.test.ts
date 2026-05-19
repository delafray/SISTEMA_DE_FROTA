import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/whatsapp/auth', () => ({
  identificarRemetente: vi.fn(),
}));

vi.mock('@/lib/whatsapp/sessionManager', () => ({
  getOrCreateSession: vi.fn(),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/whatsapp/messageSender', () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
  enviarBotoes: vi.fn().mockResolvedValue(true),
  enviarLista: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/flows/kmFlow', () => ({ processarKmFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/avariaFlow', () => ({ processarAvariaFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/viagemFlow', () => ({ processarViagemFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/abastecimentoFlow', () => ({ processarAbastecimentoFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/checklistFlow', () => ({ processarChecklistFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/adiantamentoFlow', () => ({ processarAdiantamentoFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/despesaFlow', () => ({ processarDespesaFlow: vi.fn() }));
vi.mock('@/lib/whatsapp/flows/imprevistoFlow', () => ({ processarImprevistoFlow: vi.fn() }));

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { processarMensagem, isSaudacao } from '@/lib/whatsapp/messageRouter';
import { identificarRemetente } from '@/lib/whatsapp/auth';
import { getOrCreateSession, updateSession } from '@/lib/whatsapp/sessionManager';
import { enviarTexto, enviarLista } from '@/lib/whatsapp/messageSender';
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
    expect(enviarLista).not.toHaveBeenCalled();
  });

  it('responde gestor com texto informativo', async () => {
    (identificarRemetente as ReturnType<typeof vi.fn>).mockResolvedValue({
      tipo: 'gestor',
      usuario_id: 'u-1',
      empresa_id: 'e-1',
      nome: 'Carlos',
    });
    mockSessao('novo');

    await processarMensagem(makeMsg({ texto: 'oi' }));

    expect(enviarTexto).toHaveBeenCalledOnce();
    const [para, texto] = (enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(para).toBe('5531999');
    expect(texto).toContain('Carlos');
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

  it('sessão nova → envia seleção de veículo', async () => {
    mockSessao('novo');
    await processarMensagem(makeMsg({ texto: 'oi' }));
    expect(enviarLista).toHaveBeenCalledOnce();
    const args = (enviarLista as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe('5531999');
    expect(args[1]).toContain('caminhão');
    expect(updateSession).toHaveBeenCalledWith('sess-1', { estado: 'aguardando_veiculo' });
  });

  it('saudação reseta para seleção de veículo mesmo com sessão ativa', async () => {
    mockSessao('aguardando_acao', { veiculo_id: 'v-1' });
    await processarMensagem(makeMsg({ texto: 'oi' }));
    expect(enviarLista).toHaveBeenCalledOnce();
  });

  it('estado aguardando_foto_km → delega ao kmFlow', async () => {
    mockSessao('aguardando_foto_km');
    await processarMensagem(makeMsg({ tipo: 'foto', mediaId: 'm-1' }));
    expect(processarKmFlow).toHaveBeenCalledOnce();
    expect(enviarLista).not.toHaveBeenCalled();
  });

  it('estado aguardando_avaria_midia → delega ao avariaFlow', async () => {
    mockSessao('aguardando_avaria_midia');
    await processarMensagem(makeMsg({ tipo: 'audio', mediaId: 'a-1' }));
    expect(processarAvariaFlow).toHaveBeenCalledOnce();
  });

  it('seleção de veículo inválida pede pra selecionar de novo', async () => {
    mockSessao('aguardando_veiculo');
    await processarMensagem(makeMsg({ texto: 'não sei' }));
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('lista');
  });
});

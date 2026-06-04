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

// Supabase chainável para queries de SELECT
function makeChain(resolved: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockResolvedValue(resolved);
  // Faz o chain ser awaitable (resolve ao ser await-ado)
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(res, rej);
  return chain;
}

let supabaseChainFactory: () => ReturnType<typeof makeChain>;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => supabaseChainFactory()) })),
}));

import { processarViagemFlow } from '@/lib/whatsapp/flows/viagemFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes, enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { updateSession } from '@/lib/whatsapp/sessionManager';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Motorista', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}
function makeSessao(estado: string, contexto: Record<string, unknown> = {}): Sessao {
  return { id: 'sess-1', whatsapp: '5531999', motorista_id: 'mot-1', usuario_id: 'usr-1', empresa_id: 'emp-1', estado: estado as Sessao['estado'], contexto, ultimo_contato: new Date().toISOString() };
}

describe('viagemFlow — aguardando_origem_destino', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChainFactory = () => makeChain({ data: [], error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('tipo != texto → pede origem/destino', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'foto' }), makeSessao('aguardando_origem_destino'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('origem'));
  });

  it('"São Paulo → Campinas" (seta) → extrai origem e destino corretamente', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'São Paulo → Campinas' }), makeSessao('aguardando_origem_destino'));
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto.pedido_dados;
    expect(ctx.origem).toBe('São Paulo');
    expect(ctx.destino).toBe('Campinas');
  });

  it('"SP -> Campinas" (traço) → extrai corretamente', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'SP -> Campinas' }), makeSessao('aguardando_origem_destino'));
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto.pedido_dados;
    expect(ctx.origem).toBe('SP');
    expect(ctx.destino).toBe('Campinas');
  });

  it('"SP para Campinas" → extrai com separador "para"', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'SP para Campinas' }), makeSessao('aguardando_origem_destino'));
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto.pedido_dados;
    expect(ctx.origem).toBe('SP');
    expect(ctx.destino).toBe('Campinas');
  });

  it('sem separador → texto inteiro como origem, destino vazio', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'São Paulo' }), makeSessao('aguardando_origem_destino'));
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto.pedido_dados;
    expect(ctx.origem).toBe('São Paulo');
    expect(ctx.destino).toBe('');
  });

  it('sem clientes cadastrados → vai direto para aguardando_valor_pedido', async () => {
    supabaseChainFactory = () => makeChain({ data: [], error: null });
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'SP → Campinas' }), makeSessao('aguardando_origem_destino'));

    const calls = (updateSession as ReturnType<typeof vi.fn>).mock.calls;
    const estadoFinal = calls[calls.length - 1][1];
    expect(estadoFinal).toMatchObject({ estado: 'aguardando_valor_pedido' });
    expect(enviarMenuBotoes).toHaveBeenCalledOnce(); // botão Pular
  });

  it('com clientes → envia lista com clientes + opção avulso', async () => {
    supabaseChainFactory = () => makeChain({ data: [{ id: 'c-1', nome_fantasia: 'Transportes XYZ' }], error: null });
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'SP → Campinas' }), makeSessao('aguardando_origem_destino'));

    expect(enviarMenuLista).toHaveBeenCalledOnce();
    const itens = (enviarMenuLista as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(itens.some((i: { id: string }) => i.id === 'cliente_c-1')).toBe(true);
    expect(itens.some((i: { id: string }) => i.id === 'cliente_avulso')).toBe(true);
    const calls = (updateSession as ReturnType<typeof vi.fn>).mock.calls;
    const estadoFinal = calls[calls.length - 1][1];
    expect(estadoFinal).toMatchObject({ estado: 'aguardando_cliente' });
  });
});

describe('viagemFlow — aguardando_cliente', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('tipo != lista → pede seleção', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'xyz' }), makeSessao('aguardando_cliente'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('lista'));
  });

  it('"cliente_avulso" → clienteId=null + avança para aguardando_valor_pedido', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'lista', listaId: 'cliente_avulso' }), makeSessao('aguardando_cliente'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_valor_pedido',
      contexto: { pedido_dados: expect.objectContaining({ cliente_id: null }) },
    }));
  });

  it('"cliente_abc123" → clienteId="abc123" + avança para aguardando_valor_pedido', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'lista', listaId: 'cliente_abc123' }), makeSessao('aguardando_cliente'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_valor_pedido',
      contexto: { pedido_dados: expect.objectContaining({ cliente_id: 'abc123' }) },
    }));
  });
});

describe('viagemFlow — aguardando_valor_pedido', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('pedido_pular → valorPedido=null + pede foto KM + aguardando_foto_km', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'botao', botaoId: 'pedido_pular' }), makeSessao('aguardando_valor_pedido'));
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('KM inicial'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_foto_km',
      contexto: { pedido_dados: expect.objectContaining({ valor_pedido: null }) },
    }));
  });

  it('texto "1500" → valor=1500 + pede foto KM', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: '1500' }), makeSessao('aguardando_valor_pedido'));
    expect(updateSession).toHaveBeenCalledWith('sess-1', expect.objectContaining({
      estado: 'aguardando_foto_km',
      contexto: { pedido_dados: expect.objectContaining({ valor_pedido: 1500 }) },
    }));
  });

  it('texto "1.500,00" (formato BR) → valor=1500', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: '1.500,00' }), makeSessao('aguardando_valor_pedido'));
    const ctx = (updateSession as ReturnType<typeof vi.fn>).mock.calls[0][1].contexto.pedido_dados;
    expect(ctx.valor_pedido).toBe(1500);
  });

  it('texto inválido "abc" → mensagem de erro, não avança', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'texto', texto: 'abc' }), makeSessao('aguardando_valor_pedido'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('valor'));
  });

  it('tipo inesperado → pede valor', async () => {
    await processarViagemFlow(makeMsg({ tipo: 'foto' }), makeSessao('aguardando_valor_pedido'));
    expect(updateSession).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('valor'));
  });
});

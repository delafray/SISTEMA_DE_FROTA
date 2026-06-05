import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { UserIdentity } from '@/lib/whatsapp/auth';

vi.mock('@/lib/whatsapp/messageSender', () => ({ enviarTexto: vi.fn().mockResolvedValue(true) }));
vi.mock('@/services/aiService', () => ({ classificarIntentTexto: vi.fn() }));

// Supabase chainável com suporte a tabelas diferentes
const supabaseDataMap: Record<string, unknown> = {};
// Captura inserts (ex: lembretes). Resolve com o que estiver em supabaseDataMap['<tabela>:insert'].
const insertSpy = vi.fn();

function makeChain(table: string) {
  const resolved = supabaseDataMap[table] ?? { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn((payload: unknown) => {
    insertSpy(table, payload);
    return Promise.resolve(supabaseDataMap[`${table}:insert`] ?? { error: null });
  });
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(res, rej);
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((t: string) => makeChain(t)) })),
}));

import { processarGestorFlow } from '@/lib/whatsapp/flows/gestorFlow';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { classificarIntentTexto } from '@/services/aiService';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

function makeMsg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return { from: '5531999', fromName: 'Gestor', messageId: 'wamid.x', timestamp: new Date(), tipo: 'texto', phoneNumberId: 'pnid', ...over };
}

type IdentityGestor = Extract<UserIdentity, { tipo: 'gestor' | 'master' }>;
function makeIdentity(over: Partial<IdentityGestor> = {}): IdentityGestor {
  return { tipo: 'gestor', usuario_id: 'usr-1', empresa_id: 'emp-1', nome: 'Gestor Teste', ...over } as IdentityGestor;
}

describe('gestorFlow — tipos de mensagem não-texto', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('foto → mensagem de "em desenvolvimento"', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'foto', mediaId: 'x' }), makeIdentity());
    expect(classificarIntentTexto).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('desenvolvimento'));
  });

  it('documento → mensagem de "em desenvolvimento"', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'documento' }), makeIdentity());
    expect(classificarIntentTexto).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('desenvolvimento'));
  });

  it('áudio (tipo != texto) → envia menu gestor', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'audio', mediaId: 'x' }), makeIdentity());
    expect(classificarIntentTexto).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('entendo perguntas'));
  });
});

describe('gestorFlow — classificação de intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: queries retornam dados vazios
    Object.keys(supabaseDataMap).forEach(k => delete supabaseDataMap[k]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('classificarIntentTexto falha → menu gestor', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, motivo: 'timeout' });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'qual lucro?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('entendo perguntas'));
  });

  it('confiança < 55 → menu gestor', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_lucro_mensal', confianca: 40 } });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'oi' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('entendo perguntas'));
  });

  it('intent=fallback → menu gestor', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'fallback', confianca: 80 } });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'bom dia' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('entendo perguntas'));
  });

  // ─── Lembrete DETERMINÍSTICO no gestorFlow (Fix #5) ───────────────────
  it('"anota que fechei contrato" → PERSISTE lembrete (insert), NÃO classifica intent nem cai no menu', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'anota que fechei contrato' }), makeIdentity());
    // Salvou via criarLembrete → insert na tabela lembretes
    expect(insertSpy).toHaveBeenCalledWith('lembretes', expect.objectContaining({
      empresa_id: 'emp-1',
      texto: 'fechei contrato',
      origem: 'whatsapp',
      criado_por_nome: 'Gestor Teste',
      criado_por_telefone: '5531999',
    }));
    // NÃO foi pro intent classifier (lembrete tratado antes)
    expect(classificarIntentTexto).not.toHaveBeenCalled();
    // Confirmou pro gestor, sem cair no menu
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Anotado');
  });

  it('"lembrete: comprar pneu" → persiste e confirma', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'lembrete: comprar pneu' }), makeIdentity());
    expect(insertSpy).toHaveBeenCalledWith('lembretes', expect.objectContaining({ texto: 'comprar pneu' }));
    expect(classificarIntentTexto).not.toHaveBeenCalled();
  });

  it('"lembrete" sozinho → pede o texto, NÃO insere nem classifica', async () => {
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'lembrete' }), makeIdentity());
    expect(insertSpy).not.toHaveBeenCalled();
    expect(classificarIntentTexto).not.toHaveBeenCalled();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('O que você quer anotar');
  });

  it('pergunta normal "qual o lucro?" → NÃO dispara lembrete, vai pro intent classifier', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_lucro_mensal', confianca: 90 } });
    supabaseDataMap['pedidos_com_resultado'] = { data: [], error: null };
    supabaseDataMap['veiculos_resultado_periodo'] = { data: [], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'qual o lucro?' }), makeIdentity());
    expect(insertSpy).not.toHaveBeenCalled();
    expect(classificarIntentTexto).toHaveBeenCalledOnce();
  });

  it('intent=consulta_lucro_mensal → chama responderLucroMensal, envia texto', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_lucro_mensal', confianca: 90 } });
    supabaseDataMap['pedidos_com_resultado'] = { data: [], error: null };
    supabaseDataMap['veiculos_resultado_periodo'] = { data: [], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'qual o lucro?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Resultado');
  });

  it('intent=consulta_fretes_ativos → responde pedidos ativos', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_fretes_ativos', confianca: 85 } });
    supabaseDataMap['pedidos'] = { data: [], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'quem está em rota?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('andamento');
  });

  it('intent=consulta_motorista sem parametros.motorista_nome → pede nome', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_motorista', confianca: 80, parametros: {} } });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'status do motorista' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('nome'));
  });

  it('intent=consulta_motorista com nome → busca motorista e responde', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_motorista', confianca: 80, parametros: { motorista_nome: 'João' } } });
    supabaseDataMap['motoristas'] = { data: [{ id: 'm-1', nome: 'João Silva', cnh_validade: '2030-01-01', ativo: true }], error: null };
    supabaseDataMap['pedidos'] = { data: null, error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'como está o João?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('João Silva');
  });

  it('intent=consulta_fretes_mes → responde contagem do mês', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_fretes_mes', confianca: 80 } });
    supabaseDataMap['pedidos'] = { data: [{ status: 'concluido' }, { status: 'em_andamento' }], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'quantos pedidos?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('total 2');
  });

  it('intent=consulta_pendencias sem adiantamentos → mensagem "nenhum pendente"', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_pendencias', confianca: 80 } });
    supabaseDataMap['adiantamentos'] = { data: [], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'tem pendência?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Nenhum'));
  });

  it('intent=consulta_frota_saude → responde visão da frota', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_frota_saude', confianca: 80 } });
    supabaseDataMap['veiculos'] = { data: [], error: null, count: 3 };
    supabaseDataMap['avarias'] = { data: [], error: null };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'como está a frota?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain('Frota');
  });

  it('intent=consulta_lucro_veiculo sem placa → pede placa', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_lucro_veiculo', confianca: 80, parametros: {} } });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'lucro do caminhão' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('placa'));
  });

  it('intent=cadastrar_pedido → mensagem de "em breve"', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'cadastrar_pedido', confianca: 80 } });
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'quero cadastrar pedido' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('em breve'));
  });
});

describe('gestorFlow — erros de banco', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('consulta_lucro_mensal com erro DB → mensagem amigável', async () => {
    (classificarIntentTexto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { intent: 'consulta_lucro_mensal', confianca: 90 } });
    supabaseDataMap['pedidos_com_resultado'] = { data: null, error: { message: 'DB down', code: '500' } };
    await processarGestorFlow(makeMsg({ tipo: 'texto', texto: 'lucro?' }), makeIdentity());
    expect(enviarTexto).toHaveBeenCalledWith('5531999', expect.stringContaining('Não consegui'));
  });
});

// NOTA: lembretes agora são uma TOOL do Gemini (criar_lembrete), testada em
// frotaTools.test.ts. O gestorFlow não trata mais lembretes diretamente.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enviarTexto,
  enviarBotoes,
  enviarLista,
  enviarImagem,
  enviarDocumento,
  marcarComoLida,
  formatarDestinatarioMeta,
  formatarMenuTexto,
} from '@/lib/whatsapp/messageSender';

const ORIG_ENV = { ...process.env };

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ key: { id: 'evo-msg-id' } }),
  });
}

function mockFetchFail(status = 400, body = 'bad') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  });
}

function mockFetchNetworkErr(err = new Error('boom')) {
  return vi.fn().mockRejectedValue(err);
}

function mockFetchAbort() {
  return vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  });
}

describe('messageSender (Evolution API)', () => {
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = 'https://frota-evolution.up.railway.app';
    process.env.EVOLUTION_API_KEY = 'fake-api-key';
    process.env.EVOLUTION_INSTANCE_NAME = 'frota-bot';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    vi.restoreAllMocks();
  });

  // ── enviarTexto ──

  it('enviarTexto faz POST para /message/sendText/{instance}', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const ok = await enviarTexto('5531989791317', 'olá motorista');
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://frota-evolution.up.railway.app/message/sendText/frota-bot');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('fake-api-key');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      number: '5531989791317',
      text: 'olá motorista',
    });
  });

  it('retorna false em resposta não-ok', async () => {
    vi.stubGlobal('fetch', mockFetchFail(401, 'Unauthorized'));
    expect(await enviarTexto('5531', 'oi')).toBe(false);
  });

  it('retorna false em erro de rede', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkErr(new Error('econnreset')));
    expect(await enviarTexto('5531', 'oi')).toBe(false);
  });

  it('lança erro quando variáveis de ambiente faltam', async () => {
    delete process.env.EVOLUTION_API_URL;
    vi.stubGlobal('fetch', mockFetchOk());
    await expect(enviarTexto('5531', 'oi')).rejects.toThrow(/EVOLUTION_API_URL/);
  });

  // ── enviarBotoes ──

  it('enviarBotoes faz POST para /message/sendButtons/{instance}', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await enviarBotoes(
      '5531',
      'Confirma?',
      [
        { id: 'sim', titulo: 'Sim' },
        { id: 'nao', titulo: 'Não' },
      ],
      'Abastecimento'
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/message/sendButtons/frota-bot');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      number: '5531',
      title: 'Abastecimento',
      description: 'Confirma?',
      buttons: [
        { text: 'Sim', id: 'sim' },
        { text: 'Não', id: 'nao' },
      ],
    });
  });

  it('enviarBotoes limita a 3 botões e trunca títulos', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await enviarBotoes('5531', 'escolha', [
      { id: '1', titulo: 'Um' },
      { id: '2', titulo: 'Dois' },
      { id: '3', titulo: 'TresQuatroCincoSeisSeteOitoNoveDez' },
      { id: '4', titulo: 'Quatro' }, // deve ser ignorado
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.buttons).toHaveLength(3);
    expect(body.buttons[2].text.length).toBeLessThanOrEqual(20);
  });

  // ── enviarLista ──

  it('enviarLista faz POST para /message/sendList/{instance}', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await enviarLista(
      '5531',
      'corpo',
      'Ver opções',
      [
        {
          titulo: 'Seção A',
          itens: [
            { id: 'a1', titulo: 'Item Um', descricao: 'desc' },
            { id: 'a2', titulo: 'Item Dois' },
          ],
        },
      ],
      'cabeça',
      'rodapé'
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/message/sendList/frota-bot');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      number: '5531',
      description: 'corpo',
      buttonText: 'Ver opções',
      footerText: 'rodapé',
    });
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].rows[0].rowId).toBe('a1');
    expect(body.sections[0].rows[1].rowId).toBe('a2');
  });

  // ── enviarImagem ──

  it('enviarImagem faz POST com mediatype=image', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    await enviarImagem('5531', 'https://r2.dev/x.jpg', 'legenda');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      number: '5531',
      mediatype: 'image',
      media: 'https://r2.dev/x.jpg',
      caption: 'legenda',
    });
  });

  // ── enviarDocumento ──

  it('enviarDocumento faz POST com mediatype=document e fileName', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    await enviarDocumento('5531', 'https://r2.dev/doc.pdf', 'nota.pdf');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      number: '5531',
      mediatype: 'document',
      media: 'https://r2.dev/doc.pdf',
      fileName: 'nota.pdf',
    });
  });

  // ── marcarComoLida ──

  it('marcarComoLida chama /chat/markMessageAsRead/{instance}', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const ok = await marcarComoLida('evo-msg-id');
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/chat/markMessageAsRead/frota-bot');
    const body = JSON.parse(init.body);
    expect(body.readMessages[0].id).toBe('evo-msg-id');
  });

  it('marcarComoLida retorna false em AbortError (timeout)', async () => {
    vi.stubGlobal('fetch', mockFetchAbort());
    const ok = await marcarComoLida('evo-msg-id');
    expect(ok).toBe(false);
  });

  it('marcarComoLida retorna false silenciosamente em caso de falha', async () => {
    vi.stubGlobal('fetch', mockFetchFail(500));
    const ok = await marcarComoLida('evo-msg-id');
    expect(ok).toBe(false);
  });
});

// ── formatarDestinatarioMeta ──

describe('formatarDestinatarioMeta', () => {
  it('remove todos os caracteres não numéricos', () => {
    expect(formatarDestinatarioMeta('+55 (31) 9 8979-1317')).toBe('5531989791317');
  });

  it('mantém número que já está limpo', () => {
    expect(formatarDestinatarioMeta('5531989791317')).toBe('5531989791317');
  });

  it('mantém número internacional não-BR', () => {
    expect(formatarDestinatarioMeta('14155552671')).toBe('14155552671');
  });
});

describe('formatarMenuTexto', () => {
  it('formata corpo + opcoes numeradas (1️⃣..🔟) + instrucao final', () => {
    const txt = formatarMenuTexto('Escolha um:', [
      { id: 'a', titulo: 'Opcao A' },
      { id: 'b', titulo: 'Opcao B' },
    ]);
    expect(txt).toContain('Escolha um:');
    expect(txt).toContain('1️⃣ Opcao A');
    expect(txt).toContain('2️⃣ Opcao B');
    expect(txt).toContain('Responda com o número');
  });

  it('inclui descricao em italico quando presente', () => {
    const txt = formatarMenuTexto('Caminhoes:', [
      { id: 'v1', titulo: 'ABC-1234', descricao: 'Mercedes-Benz Atego' },
    ]);
    expect(txt).toContain('1️⃣ ABC-1234');
    expect(txt).toContain('_Mercedes-Benz Atego_');
  });

  it('inclui rodape quando passado', () => {
    const txt = formatarMenuTexto('Confirme:', [{ id: 'y', titulo: 'Sim' }], 'Ou mande foto');
    expect(txt).toContain('Ou mande foto');
  });

  it('usa fallback "*N.*" para opcoes alem de 10 (sem emoji)', () => {
    const opcoes = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, titulo: `Opc ${i}` }));
    const txt = formatarMenuTexto('Lista grande:', opcoes);
    expect(txt).toContain('🔟 Opc 9');
    expect(txt).toContain('*11.* Opc 10');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enviarTexto,
  enviarBotoes,
  enviarLista,
  enviarImagem,
  enviarDocumento,
  marcarComoLida,
} from '@/lib/whatsapp/messageSender';

const ORIG_ENV = { ...process.env };

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '',
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

describe('messageSender', () => {
  beforeEach(() => {
    process.env.META_WHATSAPP_TOKEN = 'fake-token';
    process.env.META_PHONE_NUMBER_ID = 'fake-pnid';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    vi.restoreAllMocks();
  });

  it('enviarTexto faz POST com payload correto', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    const ok = await enviarTexto('5531123', 'olá');
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/fake-pnid/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer fake-token');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5531123',
      type: 'text',
      text: { body: 'olá' },
    });
  });

  it('retorna false em resposta não-ok', async () => {
    vi.stubGlobal('fetch', mockFetchFail(401, 'invalid token'));
    expect(await enviarTexto('5531', 'oi')).toBe(false);
  });

  it('retorna false em erro de rede', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkErr(new Error('econnreset')));
    expect(await enviarTexto('5531', 'oi')).toBe(false);
  });

  it('retorna false em AbortError (timeout)', async () => {
    vi.stubGlobal('fetch', mockFetchAbort());
    const ok = await marcarComoLida('wamid.abc');
    expect(ok).toBe(false);
  });

  it('getConfig lança erro quando env vars faltam', async () => {
    delete process.env.META_WHATSAPP_TOKEN;
    vi.stubGlobal('fetch', mockFetchOk());
    await expect(enviarTexto('5531', 'oi')).rejects.toThrow(/META_WHATSAPP_TOKEN/);
  });

  it('enviarBotoes limita a 3 botões e trunca títulos', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await enviarBotoes(
      '5531',
      'escolha',
      [
        { id: '1', titulo: 'Um' },
        { id: '2', titulo: 'Dois' },
        { id: '3', titulo: 'TresQuatroCincoSeisSeteOitoNoveDez' },
        { id: '4', titulo: 'Quatro' },
      ],
      'header'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.interactive.action.buttons).toHaveLength(3);
    expect(body.interactive.action.buttons[2].reply.title.length).toBeLessThanOrEqual(20);
    expect(body.interactive.header).toEqual({ type: 'text', text: 'header' });
  });

  it('enviarLista monta seções com truncamento correto', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);

    await enviarLista(
      '5531',
      'corpo',
      'Selecionar',
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

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.interactive.type).toBe('list');
    expect(body.interactive.action.sections).toHaveLength(1);
    expect(body.interactive.action.sections[0].rows[0].id).toBe('a1');
    expect(body.interactive.footer).toEqual({ text: 'rodapé' });
  });

  it('enviarImagem manda type=image', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    await enviarImagem('5531', 'https://x/y.jpg', 'legenda');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'image',
      image: { link: 'https://x/y.jpg', caption: 'legenda' },
    });
  });

  it('enviarDocumento manda type=document com filename', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    await enviarDocumento('5531', 'https://x/n.pdf', 'nota.pdf');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'document',
      document: { link: 'https://x/n.pdf', filename: 'nota.pdf' },
    });
  });

  it('marcarComoLida envia status=read com timeout curto', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const ok = await marcarComoLida('wamid.xyz');
    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ status: 'read', message_id: 'wamid.xyz' });
    // verifica que um AbortSignal foi passado (timeout configurado)
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });
});

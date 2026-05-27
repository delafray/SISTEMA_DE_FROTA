import { describe, it, expect } from 'vitest';
import { parseWebhookPayload, type EvolutionWebhookPayload } from '@/lib/whatsapp/messageParser';

// ─── Helpers ─────────────────────────────────────────────────────────

function makePayload(data: object | object[]): EvolutionWebhookPayload {
  return {
    event: 'messages.upsert',
    instance: 'frota-bot',
    data: data as never,
  };
}

const keyBase = {
  remoteJid: '5531989791317@s.whatsapp.net',
  id: 'evo-msg-id',
  fromMe: false,
};

const msgBase = {
  key: keyBase,
  pushName: 'João Motorista',
  messageTimestamp: 1779170770,
};

// ─── Testes ───────────────────────────────────────────────────────────

describe('parseWebhookPayload (Evolution API)', () => {
  it('parseia mensagem de texto simples (conversation)', () => {
    const out = parseWebhookPayload(
      makePayload({ ...msgBase, messageType: 'conversation', message: { conversation: 'Oi' } })
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      from: '5531989791317',
      fromName: 'João Motorista',
      messageId: 'evo-msg-id',
      tipo: 'texto',
      texto: 'Oi',
    });
    expect(out[0].timestamp).toBeInstanceOf(Date);
    expect(out[0].timestamp.getTime()).toBe(1779170770 * 1000);
  });

  it('parseia extendedTextMessage', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'extendedTextMessage',
        message: { extendedTextMessage: { text: 'mensagem longa' } },
      })
    );
    expect(out[0]).toMatchObject({ tipo: 'texto', texto: 'mensagem longa' });
  });

  it('parseia imagem com caption e url', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'imageMessage',
        message: {
          imageMessage: {
            caption: 'odômetro',
            url: 'https://mmg.whatsapp.net/img.jpg',
            mimetype: 'image/jpeg',
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'foto',
      mediaId: 'https://mmg.whatsapp.net/img.jpg',
      mediaMimeType: 'image/jpeg',
      texto: 'odômetro',
    });
  });

  it('parseia áudio (ptt)', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'audioMessage',
        message: {
          audioMessage: {
            url: 'https://mmg.whatsapp.net/aud.ogg',
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'audio',
      mediaId: 'https://mmg.whatsapp.net/aud.ogg',
      mediaMimeType: 'audio/ogg; codecs=opus',
    });
  });

  it('parseia documento com filename', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'documentMessage',
        message: {
          documentMessage: {
            url: 'https://mmg.whatsapp.net/doc.pdf',
            mimetype: 'application/pdf',
            fileName: 'nota.pdf',
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'documento',
      mediaId: 'https://mmg.whatsapp.net/doc.pdf',
      mediaFilename: 'nota.pdf',
    });
  });

  it('parseia resposta de botão interativo', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'buttonsResponseMessage',
        message: {
          buttonsResponseMessage: {
            selectedButtonId: 'abast_confirmar',
            selectedDisplayText: '✅ Confirmar',
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'botao',
      botaoId: 'abast_confirmar',
      botaoTitulo: '✅ Confirmar',
    });
  });

  it('parseia resposta de lista interativa', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'listResponseMessage',
        message: {
          listResponseMessage: {
            singleSelectReply: { selectedRowId: 'veiculo_abc123' },
            title: 'ABC-1234',
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'lista',
      listaId: 'veiculo_abc123',
      listaTitulo: 'ABC-1234',
    });
  });

  it('parseia localização', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        messageType: 'locationMessage',
        message: {
          locationMessage: {
            degreesLatitude: -19.91,
            degreesLongitude: -43.95,
            name: 'Belo Horizonte',
          },
        },
      })
    );
    expect(out[0]).toMatchObject({
      tipo: 'localizacao',
      latitude: -19.91,
      longitude: -43.95,
      texto: 'Belo Horizonte',
    });
  });

  it('ignora mensagens enviadas pelo bot (fromMe: true)', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        key: { ...keyBase, fromMe: true },
        message: { conversation: 'mensagem do bot' },
      })
    );
    expect(out).toHaveLength(0);
  });

  it('ignora grupos (@g.us)', () => {
    const out = parseWebhookPayload(
      makePayload({
        ...msgBase,
        key: { ...keyBase, remoteJid: '120363123456789@g.us' },
        message: { conversation: 'msg de grupo' },
      })
    );
    expect(out).toHaveLength(0);
  });

  it('ignora eventos que não sejam messages.upsert', () => {
    const payload: EvolutionWebhookPayload = {
      event: 'connection.update',
      instance: 'frota-bot',
      data: { key: keyBase, message: { conversation: 'oi' } } as never,
    };
    expect(parseWebhookPayload(payload)).toHaveLength(0);
  });

  it('processa array de mensagens no campo data', () => {
    const out = parseWebhookPayload(
      makePayload([
        { ...msgBase, key: { ...keyBase, id: 'id-1' }, message: { conversation: 'um' } },
        { ...msgBase, key: { ...keyBase, id: 'id-2' }, message: { conversation: 'dois' } },
      ])
    );
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.texto)).toEqual(['um', 'dois']);
  });

  it('usa "Desconhecido" quando pushName ausente', () => {
    const out = parseWebhookPayload(
      makePayload({ key: keyBase, message: { conversation: 'oi' } })
    );
    expect(out[0].fromName).toBe('Desconhecido');
  });

  it('mapeia mensagem sem campo message para "outro"', () => {
    const out = parseWebhookPayload(makePayload({ key: keyBase }));
    expect(out[0].tipo).toBe('outro');
  });

  it('extrai número sem @s.whatsapp.net', () => {
    const out = parseWebhookPayload(
      makePayload({ ...msgBase, message: { conversation: 'oi' } })
    );
    expect(out[0].from).toBe('5531989791317');
    expect(out[0].from).not.toContain('@');
  });
});

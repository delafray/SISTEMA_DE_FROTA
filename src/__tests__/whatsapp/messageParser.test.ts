import { describe, it, expect } from 'vitest';
import { parseWebhookPayload, type WebhookPayload } from '@/lib/whatsapp/messageParser';

function makePayload(messages: unknown[], contacts: unknown[] = []): WebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15556458410', phone_number_id: '107874' },
              contacts: contacts as never,
              messages: messages as never,
            },
          },
        ],
      },
    ],
  };
}

const contatoBase = [{ profile: { name: 'Ronaldo' }, wa_id: '553189791317' }];

const msgBase = {
  from: '553189791317',
  id: 'wamid.test',
  timestamp: '1779170770',
};

describe('parseWebhookPayload', () => {
  it('parseia mensagem de texto', () => {
    const out = parseWebhookPayload(
      makePayload([{ ...msgBase, type: 'text', text: { body: 'oi' } }], contatoBase)
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      from: '553189791317',
      fromName: 'Ronaldo',
      messageId: 'wamid.test',
      tipo: 'texto',
      texto: 'oi',
      phoneNumberId: '107874',
    });
    expect(out[0].timestamp).toBeInstanceOf(Date);
    expect(out[0].timestamp.getTime()).toBe(1779170770 * 1000);
  });

  it('parseia botão interativo (button_reply)', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'sim', title: 'Sim' } },
          },
        ],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({ tipo: 'botao', botaoId: 'sim', botaoTitulo: 'Sim' });
  });

  it('parseia lista interativa (list_reply)', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'interactive',
            interactive: { type: 'list_reply', list_reply: { id: 'frete_1', title: 'Frete A' } },
          },
        ],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({ tipo: 'lista', listaId: 'frete_1', listaTitulo: 'Frete A' });
  });

  it('parseia imagem com caption', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'image',
            image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'x', caption: 'odômetro' },
          },
        ],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({
      tipo: 'foto',
      mediaId: 'media-1',
      mediaMimeType: 'image/jpeg',
      texto: 'odômetro',
    });
  });

  it('parseia áudio', () => {
    const out = parseWebhookPayload(
      makePayload(
        [{ ...msgBase, type: 'audio', audio: { id: 'a-1', mime_type: 'audio/ogg', sha256: 'x' } }],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({ tipo: 'audio', mediaId: 'a-1', mediaMimeType: 'audio/ogg' });
  });

  it('parseia documento com filename', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'document',
            document: { id: 'd-1', mime_type: 'application/pdf', sha256: 'x', filename: 'nota.pdf' },
          },
        ],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({
      tipo: 'documento',
      mediaId: 'd-1',
      mediaFilename: 'nota.pdf',
    });
  });

  it('parseia localização', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'location',
            location: { latitude: -19.91, longitude: -43.95, name: 'BH' },
          },
        ],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({
      tipo: 'localizacao',
      latitude: -19.91,
      longitude: -43.95,
      texto: 'BH',
    });
  });

  it('parseia botão de template (type: button)', () => {
    const out = parseWebhookPayload(
      makePayload(
        [{ ...msgBase, type: 'button', button: { text: 'Confirmar', payload: 'CONFIRM' } }],
        contatoBase
      )
    );
    expect(out[0]).toMatchObject({ tipo: 'botao', botaoId: 'CONFIRM', botaoTitulo: 'Confirmar' });
  });

  it('usa "Desconhecido" quando contato não está presente', () => {
    const out = parseWebhookPayload(
      makePayload([{ ...msgBase, type: 'text', text: { body: 'oi' } }], [])
    );
    expect(out[0].fromName).toBe('Desconhecido');
  });

  it('ignora payload que não é whatsapp_business_account', () => {
    const payload = {
      object: 'page',
      entry: [],
    } as unknown as WebhookPayload;
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it('ignora changes com field diferente de "messages"', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'e',
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1', phone_number_id: '1' },
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it('retorna vazio para status updates (apenas statuses, sem messages)', () => {
    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'e',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1', phone_number_id: '1' },
                statuses: [
                  { id: 'm1', status: 'delivered', timestamp: '1', recipient_id: 'r' },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it('processa múltiplas mensagens em um único payload', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          { ...msgBase, id: 'm1', type: 'text', text: { body: 'um' } },
          { ...msgBase, id: 'm2', type: 'text', text: { body: 'dois' } },
        ],
        contatoBase
      )
    );
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.texto)).toEqual(['um', 'dois']);
  });

  it('mapeia interactive sem type específico para "outro"', () => {
    const out = parseWebhookPayload(
      makePayload(
        [
          {
            ...msgBase,
            type: 'interactive',
            interactive: { type: 'unknown' as never },
          },
        ],
        contatoBase
      )
    );
    expect(out[0].tipo).toBe('outro');
  });

  it('mapeia tipo desconhecido para "outro"', () => {
    const out = parseWebhookPayload(
      makePayload([{ ...msgBase, type: 'sticker' as never }], contatoBase)
    );
    expect(out[0].tipo).toBe('outro');
  });
});

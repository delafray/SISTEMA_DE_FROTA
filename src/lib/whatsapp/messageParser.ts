/**
 * WhatsApp Message Parser — Parseia o payload da Meta Cloud API.
 * Converte o JSON bruto do webhook em um objeto tipado e fácil de usar.
 */

// ─── TIPOS DE ENTRADA (payload da Meta) ──────────────────────────────

export type WebhookPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<RawMessage>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
};

type RawMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'interactive' | 'button' | 'location' | 'sticker';
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

// ─── TIPOS DE SAÍDA (objeto tipado para o sistema) ──────────────────

export type ParsedMessage = {
  /** Número do remetente (ex: 5511999887766) */
  from: string;
  /** Nome do remetente no perfil do WhatsApp */
  fromName: string;
  /** ID único da mensagem na Meta */
  messageId: string;
  /** Timestamp da mensagem */
  timestamp: Date;
  /** Tipo de conteúdo recebido */
  tipo: 'texto' | 'foto' | 'audio' | 'documento' | 'botao' | 'lista' | 'localizacao' | 'outro';
  /** Conteúdo de texto (body do texto ou caption da foto) */
  texto?: string;
  /** ID da mídia (para baixar depois via Meta API) */
  mediaId?: string;
  /** MIME type da mídia */
  mediaMimeType?: string;
  /** Nome do arquivo (para documentos) */
  mediaFilename?: string;
  /** Resposta de botão interativo */
  botaoId?: string;
  botaoTitulo?: string;
  /** Resposta de lista interativa */
  listaId?: string;
  listaTitulo?: string;
  /** Localização */
  latitude?: number;
  longitude?: number;
  /** ID do número de telefone do Business (nosso) */
  phoneNumberId: string;
};

// ─── FUNÇÃO PRINCIPAL ────────────────────────────────────────────────

/**
 * Parseia o payload do webhook da Meta e retorna mensagens tipadas.
 * Ignora status updates (delivered, read, etc).
 */
export function parseWebhookPayload(payload: WebhookPayload): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  if (payload.object !== 'whatsapp_business_account') {
    return messages;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const { value } = change;
      const phoneNumberId = value.metadata.phone_number_id;
      const contacts = value.contacts ?? [];
      const rawMessages = value.messages ?? [];

      for (const msg of rawMessages) {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const fromName = contact?.profile?.name ?? 'Desconhecido';

        const parsed = parseRawMessage(msg, fromName, phoneNumberId);
        if (parsed) {
          messages.push(parsed);
        }
      }
    }
  }

  return messages;
}

function parseRawMessage(msg: RawMessage, fromName: string, phoneNumberId: string): ParsedMessage | null {
  const base: Pick<ParsedMessage, 'from' | 'fromName' | 'messageId' | 'timestamp' | 'phoneNumberId'> = {
    from: msg.from,
    fromName,
    messageId: msg.id,
    timestamp: new Date(parseInt(msg.timestamp) * 1000),
    phoneNumberId,
  };

  switch (msg.type) {
    case 'text':
      return { ...base, tipo: 'texto', texto: msg.text?.body ?? '' };

    case 'image':
      return {
        ...base,
        tipo: 'foto',
        mediaId: msg.image?.id,
        mediaMimeType: msg.image?.mime_type,
        texto: msg.image?.caption,
      };

    case 'audio':
      return {
        ...base,
        tipo: 'audio',
        mediaId: msg.audio?.id,
        mediaMimeType: msg.audio?.mime_type,
      };

    case 'document':
      return {
        ...base,
        tipo: 'documento',
        mediaId: msg.document?.id,
        mediaMimeType: msg.document?.mime_type,
        mediaFilename: msg.document?.filename,
        texto: msg.document?.caption,
      };

    case 'interactive':
      if (msg.interactive?.type === 'button_reply') {
        return {
          ...base,
          tipo: 'botao',
          botaoId: msg.interactive.button_reply?.id,
          botaoTitulo: msg.interactive.button_reply?.title,
        };
      }
      if (msg.interactive?.type === 'list_reply') {
        return {
          ...base,
          tipo: 'lista',
          listaId: msg.interactive.list_reply?.id,
          listaTitulo: msg.interactive.list_reply?.title,
        };
      }
      return { ...base, tipo: 'outro' };

    case 'button':
      return {
        ...base,
        tipo: 'botao',
        botaoId: msg.button?.payload,
        botaoTitulo: msg.button?.text,
      };

    case 'location':
      return {
        ...base,
        tipo: 'localizacao',
        latitude: msg.location?.latitude,
        longitude: msg.location?.longitude,
        texto: msg.location?.name ?? msg.location?.address,
      };

    default:
      return { ...base, tipo: 'outro' };
  }
}

/**
 * Baixa a URL de uma mídia usando o ID da Meta.
 * Primeiro busca a URL, depois baixa o conteúdo.
 */
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) {
    console.error('[messageParser] META_WHATSAPP_TOKEN não configurado');
    return null;
  }

  try {
    // 1. Buscar URL da mídia
    const res = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error('[messageParser] Falha ao buscar URL da mídia:', res.status);
      return null;
    }

    const data = await res.json();
    return data.url ?? null;
  } catch (err) {
    console.error('[messageParser] Erro ao buscar URL da mídia:', err);
    return null;
  }
}

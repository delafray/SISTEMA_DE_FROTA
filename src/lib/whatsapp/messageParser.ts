/**
 * WhatsApp Message Parser — Parseia o payload da Evolution API.
 * Converte o JSON bruto do webhook em um objeto tipado e fácil de usar.
 *
 * O formato da Evolution API é diferente da Meta Cloud API:
 * {
 *   event: "messages.upsert",
 *   instance: "frota-bot",
 *   data: {
 *     key: { remoteJid: "5531999887766@s.whatsapp.net", id: "MSG_ID", fromMe: false },
 *     pushName: "João",
 *     messageType: "conversation",
 *     message: { conversation: "Oi" },
 *     messageTimestamp: 1234567890
 *   }
 * }
 */

// ─── TIPOS DE ENTRADA (payload da Evolution API) ──────────────────────

export type EvolutionWebhookPayload = {
  event: string;
  instance: string;
  data: EvolutionMessageData | EvolutionMessageData[];
};

export type EvolutionMessageData = {
  key: {
    remoteJid: string;
    id: string;
    fromMe?: boolean;
    // Campos do Baileys novo / Evolution v2.3 para resolver telefone quando
    // remoteJid vem como @lid (Linked ID) em vez de @s.whatsapp.net.
    senderPn?: string;
    participantPn?: string;
    remoteJidAlt?: string;
  };
  pushName?: string;
  messageType?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string; url?: string; mimetype?: string };
    audioMessage?: { url?: string; mimetype?: string; ptt?: boolean };
    documentMessage?: { caption?: string; url?: string; mimetype?: string; fileName?: string };
    buttonsResponseMessage?: { selectedButtonId?: string; selectedDisplayText?: string };
    listResponseMessage?: { singleSelectReply?: { selectedRowId?: string }; title?: string };
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string };
  };
  messageTimestamp?: number | string;
  // URL da mídia já resolvida (Evolution API entrega em alguns casos)
  mediaUrl?: string;
};

// ─── TIPOS DE SAÍDA (objeto tipado para o sistema) ──────────────────

export type ParsedMessage = {
  /** Número do remetente (ex: 5511999887766) */
  from: string;
  /** Nome do remetente no perfil do WhatsApp */
  fromName: string;
  /** ID único da mensagem */
  messageId: string;
  /** Timestamp da mensagem */
  timestamp: Date;
  /** Tipo de conteúdo recebido */
  tipo: 'texto' | 'foto' | 'audio' | 'documento' | 'botao' | 'lista' | 'localizacao' | 'outro';
  /** Conteúdo de texto (body do texto ou caption da foto) */
  texto?: string;
  /** ID da mídia — na Evolution API é a URL direta da mídia */
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
  /** Mantido por compatibilidade — não usado no provider Evolution */
  phoneNumberId: string;
};

// ─── FUNÇÃO PRINCIPAL ────────────────────────────────────────────────

/**
 * Parseia o payload do webhook da Evolution API e retorna mensagens tipadas.
 * Ignora mensagens enviadas por nós (fromMe = true) e eventos que não sejam mensagens.
 */
export function parseWebhookPayload(payload: EvolutionWebhookPayload): ParsedMessage[] {
  if (payload.event !== 'messages.upsert') {
    return [];
  }

  // O campo `data` pode ser um objeto único ou um array
  const dataItems = Array.isArray(payload.data) ? payload.data : [payload.data];
  const messages: ParsedMessage[] = [];

  for (const item of dataItems) {
    // Ignorar mensagens enviadas pelo bot
    if (item.key?.fromMe === true) continue;

    const parsed = parseEvolutionMessage(item);
    if (parsed) {
      messages.push(parsed);
    }
  }

  return messages;
}

function parseEvolutionMessage(data: EvolutionMessageData): ParsedMessage | null {
  if (!data.key?.remoteJid || !data.key?.id) return null;

  // Ignorar grupos
  if (data.key.remoteJid.endsWith('@g.us')) return null;

  // Resolver o telefone real. WhatsApp/Baileys novo envia remoteJid no formato
  // @lid (Linked ID, ex: 190065204551889@lid) que NÃO é o telefone real. Nesse
  // caso, usar os campos fallback (senderPn, participantPn, remoteJidAlt) que
  // Evolution v2.3 inclui com o telefone E.164 correto. Se for @lid e nenhum
  // fallback existir, descartamos a mensagem (não dá pra identificar o remetente).
  const jid = data.key.remoteJid;
  const isLid = jid.endsWith('@lid');
  const alternativo = data.key.senderPn ?? data.key.participantPn ?? data.key.remoteJidAlt;

  if (isLid && !alternativo) return null;

  const fonteTelefone = isLid ? alternativo : jid;
  if (!fonteTelefone) return null;
  const from = fonteTelefone.replace(/@.+$/, '');

  const ts = data.messageTimestamp
    ? new Date(Number(data.messageTimestamp) * 1000)
    : new Date();

  const base = {
    from,
    fromName: data.pushName ?? 'Desconhecido',
    messageId: data.key.id,
    timestamp: ts,
    phoneNumberId: process.env.EVOLUTION_INSTANCE_NAME ?? 'frota-bot-novo',
  };

  const msg = data.message;
  if (!msg) return { ...base, tipo: 'outro' };

  // ── Texto simples ──
  if (msg.conversation) {
    return { ...base, tipo: 'texto', texto: msg.conversation };
  }

  if (msg.extendedTextMessage?.text) {
    return { ...base, tipo: 'texto', texto: msg.extendedTextMessage.text };
  }

  // ── Imagem ──
  if (msg.imageMessage) {
    return {
      ...base,
      tipo: 'foto',
      mediaId: msg.imageMessage.url ?? data.mediaUrl,
      mediaMimeType: msg.imageMessage.mimetype,
      texto: msg.imageMessage.caption,
    };
  }

  // ── Áudio ──
  if (msg.audioMessage) {
    return {
      ...base,
      tipo: 'audio',
      mediaId: msg.audioMessage.url ?? data.mediaUrl,
      mediaMimeType: msg.audioMessage.mimetype,
    };
  }

  // ── Documento ──
  if (msg.documentMessage) {
    return {
      ...base,
      tipo: 'documento',
      mediaId: msg.documentMessage.url ?? data.mediaUrl,
      mediaMimeType: msg.documentMessage.mimetype,
      mediaFilename: msg.documentMessage.fileName,
      texto: msg.documentMessage.caption,
    };
  }

  // ── Resposta de botão interativo ──
  if (msg.buttonsResponseMessage) {
    return {
      ...base,
      tipo: 'botao',
      botaoId: msg.buttonsResponseMessage.selectedButtonId,
      botaoTitulo: msg.buttonsResponseMessage.selectedDisplayText,
    };
  }

  // ── Resposta de lista interativa ──
  if (msg.listResponseMessage) {
    return {
      ...base,
      tipo: 'lista',
      listaId: msg.listResponseMessage.singleSelectReply?.selectedRowId,
      listaTitulo: msg.listResponseMessage.title,
    };
  }

  // ── Localização ──
  if (msg.locationMessage) {
    return {
      ...base,
      tipo: 'localizacao',
      latitude: msg.locationMessage.degreesLatitude,
      longitude: msg.locationMessage.degreesLongitude,
      texto: msg.locationMessage.name ?? msg.locationMessage.address,
    };
  }

  return { ...base, tipo: 'outro' };
}

/**
 * Na Evolution API, a URL da mídia já vem no payload do webhook (campo `mediaUrl`
 * ou dentro de `message.imageMessage.url`). Esta função é mantida por compatibilidade
 * com os flows que chamam `getMediaUrl(msg.mediaId)`.
 *
 * Como o `mediaId` já É a URL direta na Evolution API, simplesmente retornamos ela.
 */
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  if (!mediaId) return null;

  // Se já é uma URL HTTP(S), retorna diretamente
  if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
    return mediaId;
  }

  // Fallback: tentar buscar via Evolution API pelo ID (caso a URL não venha no payload)
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instance) {
    console.error('[messageParser] Variáveis da Evolution API não configuradas');
    return null;
  }

  try {
    const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ message: { key: { id: mediaId } } }),
    });

    if (!res.ok) {
      console.error('[messageParser] Falha ao buscar mídia:', res.status, await res.text());
      return null;
    }

    const data = await res.json() as { base64?: string; mimetype?: string };
    if (!data.base64) return null;

    // Retorna como data URL para compatibilidade com o aiService
    return `data:${data.mimetype ?? 'image/jpeg'};base64,${data.base64}`;
  } catch (err) {
    console.error('[messageParser] Erro ao buscar mídia:', err);
    return null;
  }
}

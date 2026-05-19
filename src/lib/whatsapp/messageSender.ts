/**
 * WhatsApp Message Sender — Envia mensagens via Meta Cloud API.
 * Suporta texto simples, botões interativos, listas e mídia.
 *
 * REGRA CRÍTICA (CUSTO ZERO):
 * Estas funções só devem ser usadas para RESPONDER mensagens dentro
 * da janela de 24h (motorista/gestor iniciou a conversa).
 * NUNCA usar para enviar mensagens proativas (HSM).
 */

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

function getConfig() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error('[messageSender] META_WHATSAPP_TOKEN ou META_PHONE_NUMBER_ID não configurados');
  }

  return { token, phoneNumberId };
}

async function sendRequest(
  phoneNumberId: string,
  token: string,
  body: Record<string, unknown>,
  timeoutMs = 8000
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...body,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[messageSender] Erro ao enviar mensagem:', res.status, errorText);
      return false;
    }

    return true;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error('[messageSender] Timeout ao chamar Graph API após', timeoutMs, 'ms');
    } else {
      console.error('[messageSender] Erro de rede:', err);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── TEXTO SIMPLES ──────────────────────────────────────────────────

/**
 * Envia uma mensagem de texto simples.
 */
export async function enviarTexto(para: string, texto: string): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    to: para,
    type: 'text',
    text: { body: texto },
  });
}

// ─── BOTÕES INTERATIVOS ──────────────────────────────────────────────

export type Botao = {
  id: string;
  titulo: string; // máximo 20 caracteres
};

/**
 * Envia mensagem com botões interativos (máximo 3).
 */
export async function enviarBotoes(
  para: string,
  corpo: string,
  botoes: Botao[],
  cabecalho?: string
): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: corpo },
    action: {
      buttons: botoes.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.titulo.slice(0, 20) },
      })),
    },
  };

  if (cabecalho) {
    interactive.header = { type: 'text', text: cabecalho };
  }

  return sendRequest(phoneNumberId, token, {
    to: para,
    type: 'interactive',
    interactive,
  });
}

// ─── LISTA INTERATIVA ────────────────────────────────────────────────

export type ItemLista = {
  id: string;
  titulo: string; // máximo 24 caracteres
  descricao?: string; // máximo 72 caracteres
};

export type SecaoLista = {
  titulo: string; // máximo 24 caracteres
  itens: ItemLista[];
};

/**
 * Envia lista interativa (até 10 itens por seção, até 10 seções).
 */
export async function enviarLista(
  para: string,
  corpo: string,
  textoBotao: string,
  secoes: SecaoLista[],
  cabecalho?: string,
  rodape?: string
): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  const interactive: Record<string, unknown> = {
    type: 'list',
    body: { text: corpo },
    action: {
      button: textoBotao.slice(0, 20),
      sections: secoes.map((s) => ({
        title: s.titulo.slice(0, 24),
        rows: s.itens.map((i) => ({
          id: i.id,
          title: i.titulo.slice(0, 24),
          description: i.descricao?.slice(0, 72),
        })),
      })),
    },
  };

  if (cabecalho) {
    interactive.header = { type: 'text', text: cabecalho };
  }
  if (rodape) {
    interactive.footer = { text: rodape };
  }

  return sendRequest(phoneNumberId, token, {
    to: para,
    type: 'interactive',
    interactive,
  });
}

// ─── MÍDIA ───────────────────────────────────────────────────────────

/**
 * Envia uma imagem via URL pública.
 */
export async function enviarImagem(para: string, imageUrl: string, caption?: string): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    to: para,
    type: 'image',
    image: { link: imageUrl, caption },
  });
}

/**
 * Envia um documento (PDF) via URL pública.
 */
export async function enviarDocumento(
  para: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    to: para,
    type: 'document',
    document: { link: documentUrl, filename, caption },
  });
}

// ─── MARK AS READ ────────────────────────────────────────────────────

/**
 * Marca uma mensagem como lida (double blue check).
 */
export async function marcarComoLida(messageId: string): Promise<boolean> {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(
    phoneNumberId,
    token,
    { status: 'read', message_id: messageId },
    3000
  );
}

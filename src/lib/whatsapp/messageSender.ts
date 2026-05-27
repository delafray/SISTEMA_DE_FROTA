/**
 * WhatsApp Message Sender — Envia mensagens via Evolution API.
 * Suporta texto simples, botões interativos, listas e mídia.
 *
 * A interface pública (nomes e assinaturas das funções) é idêntica
 * à versão anterior (Meta Cloud API), então todos os flows funcionam
 * sem nenhuma alteração.
 */

function getConfig() {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instance) {
    throw new Error(
      '[messageSender] EVOLUTION_API_URL, EVOLUTION_API_KEY ou EVOLUTION_INSTANCE_NAME não configurados'
    );
  }

  return { apiUrl: apiUrl.replace(/\/$/, ''), apiKey, instance };
}

/**
 * Normaliza o número para o formato aceito pela Evolution API.
 * Aceita formatos com ou sem o nono dígito BR.
 */
export function formatarDestinatarioMeta(numero: string): string {
  return numero.replace(/\D/g, '');
}

async function sendRequest(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs = 8000
): Promise<boolean> {
  const { apiUrl, apiKey, instance } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiUrl}/${endpoint}/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[messageSender] Erro ao enviar mensagem:', res.status, errorText);
      return false;
    }

    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    console.log(JSON.stringify({
      level: 'info',
      scope: 'messageSender',
      event: 'send_ok',
      ts: new Date().toISOString(),
      to: body.number,
      key: (data as { key?: unknown } | null)?.key ?? null,
    }));
    return true;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error('[messageSender] Timeout ao chamar Evolution API após', timeoutMs, 'ms');
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
  return sendRequest('message/sendText', {
    number: formatarDestinatarioMeta(para),
    text: texto,
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
  return sendRequest('message/sendButtons', {
    number: formatarDestinatarioMeta(para),
    title: cabecalho ?? '',
    description: corpo,
    footer: '',
    buttons: botoes.slice(0, 3).map((b) => ({
      text: b.titulo.slice(0, 20),
      id: b.id,
    })),
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
  return sendRequest('message/sendList', {
    number: formatarDestinatarioMeta(para),
    title: cabecalho ?? '',
    description: corpo,
    footerText: rodape ?? '',
    buttonText: textoBotao.slice(0, 20),
    sections: secoes.map((s) => ({
      title: s.titulo.slice(0, 24),
      rows: s.itens.map((i) => ({
        title: i.titulo.slice(0, 24),
        description: i.descricao?.slice(0, 72) ?? '',
        rowId: i.id,
      })),
    })),
  });
}

// ─── MÍDIA ───────────────────────────────────────────────────────────

/**
 * Envia uma imagem via URL pública.
 */
export async function enviarImagem(para: string, imageUrl: string, caption?: string): Promise<boolean> {
  return sendRequest('message/sendMedia', {
    number: formatarDestinatarioMeta(para),
    mediatype: 'image',
    media: imageUrl,
    caption: caption ?? '',
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
  return sendRequest('message/sendMedia', {
    number: formatarDestinatarioMeta(para),
    mediatype: 'document',
    media: documentUrl,
    fileName: filename,
    caption: caption ?? '',
  });
}

// ─── MARK AS READ ────────────────────────────────────────────────────

/**
 * Marca uma mensagem como lida (double blue check).
 */
export async function marcarComoLida(messageId: string): Promise<boolean> {
  try {
    const { apiUrl, apiKey, instance } = getConfig();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${apiUrl}/chat/markMessageAsRead/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          readMessages: [{ id: messageId, fromMe: false, remote: '' }],
        }),
        signal: controller.signal,
      });

      return res.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

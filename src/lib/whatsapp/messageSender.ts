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

// ─── MENU DE TEXTO (substitui listas/botões interativos) ─────────────
//
// WhatsApp não-Business + Baileys NÃO renderiza listMessage/buttonsMessage
// confiavelmente. Esta função formata as opções como texto numerado e envia
// via sendText. O caller deve passar todas as opcoes para que o roteador
// possa mapear a resposta numérica do usuário ("1", "2", ...) de volta para
// o id original ao salvá-las em sessao.contexto.menu_opcoes via updateSession.

export type OpcaoMenu = {
  id: string;
  titulo: string;
  descricao?: string;
};

const NUMEROS_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Formata um menu como texto numerado. Não envia — apenas retorna a string.
 * Exposto para testes e usos avançados; prefira `enviarMenuTexto` no fluxo normal.
 */
export function formatarMenuTexto(corpo: string, opcoes: OpcaoMenu[], rodape?: string): string {
  const linhas = opcoes.map((o, i) => {
    const num = NUMEROS_EMOJI[i] ?? `*${i + 1}.*`;
    const desc = o.descricao ? `\n   _${o.descricao}_` : '';
    return `${num} ${o.titulo}${desc}`;
  });
  let texto = `${corpo}\n\n${linhas.join('\n')}`;
  if (rodape) texto += `\n\n${rodape}`;
  texto += '\n\n_Responda com o número da opção (ex: 1)_';
  return texto;
}

/**
 * Envia um menu de opções como texto numerado.
 * NÃO salva as opções na sessão — o caller deve fazer via updateSession.
 */
export async function enviarMenuTexto(
  para: string,
  corpo: string,
  opcoes: OpcaoMenu[],
  rodape?: string
): Promise<boolean> {
  return enviarTexto(para, formatarMenuTexto(corpo, opcoes, rodape));
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

/**
 * OpenAI Client — Wrapper com retry, timeout e tratamento de erros.
 * Usado APENAS pelo aiService.ts (porta única de IA).
 */

const OPENAI_API_URL = 'https://api.openai.com/v1';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000; // 30 segundos

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('[OpenAI] OPENAI_API_KEY não configurada');
  return key;
}

/**
 * Faz uma chamada ao endpoint de chat completions (GPT-4o, GPT-4o-mini).
 */
export async function chatCompletion(params: {
  model: 'gpt-4o' | 'gpt-4o-mini';
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}): Promise<{ ok: true; content: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } | { ok: false; error: string; code: string }> {
  const { model, messages, temperature = 0.1, max_tokens = 1000, response_format } = params;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens,
      };
      if (response_format) {
        body.response_format = response_format;
      }

      const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorBody = await res.text();
        const code = res.status === 429 ? 'rate_limit'
          : res.status === 401 ? 'auth_error'
          : res.status === 402 ? 'billing_error'
          : res.status >= 500 ? 'server_error'
          : 'unknown_error';

        // Retry em rate_limit e server_error
        if ((code === 'rate_limit' || code === 'server_error') && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
          console.warn(`[OpenAI] ${code} (tentativa ${attempt + 1}/${MAX_RETRIES}). Retry em ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        return { ok: false, error: errorBody, code };
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return { ok: true, content, usage };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          console.warn(`[OpenAI] Timeout (tentativa ${attempt + 1}/${MAX_RETRIES}). Retry...`);
          continue;
        }
        return { ok: false, error: 'Timeout após 30 segundos', code: 'timeout' };
      }

      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
        code: 'network_error',
      };
    }
  }

  return { ok: false, error: 'Tentativas esgotadas', code: 'max_retries' };
}

/**
 * Faz uma chamada ao Whisper para transcrição de áudio.
 */
export async function whisperTranscription(params: {
  audioUrl: string;
  language?: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string; code: string }> {
  const { audioUrl, language = 'pt' } = params;

  try {
    // 1. Baixar o áudio da URL
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const audioRes = await fetch(audioUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!audioRes.ok) {
      return { ok: false, error: `Falha ao baixar áudio: ${audioRes.status}`, code: 'download_error' };
    }

    const audioBlob = await audioRes.blob();

    // 2. Enviar para Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    formData.append('response_format', 'json');

    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 60_000); // 60s para áudio longo

    const res = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: formData,
      signal: controller2.signal,
    });

    clearTimeout(timeoutId2);

    if (!res.ok) {
      const errorBody = await res.text();
      return { ok: false, error: errorBody, code: res.status >= 500 ? 'server_error' : 'api_error' };
    }

    const data = await res.json();
    return { ok: true, text: data.text ?? '' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Timeout na transcrição', code: 'timeout' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      code: 'network_error',
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deepgram Client — serviço de transcrição Speech-to-Text de alta precisão.
 *
 * Utiliza o modelo nova-2 otimizado para português brasileiro.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('deepgram-client');

export type TranscricaoResultado =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

/**
 * Baixa o áudio de uma URL (provida pelo Evolution API) e transcreve via Deepgram.
 * Retorna o texto transcrito ou erro. Nunca lança exceção.
 */
export async function transcreverComDeepgram(
  audioUrl: string
): Promise<TranscricaoResultado> {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return { ok: false, motivo: 'DEEPGRAM_API_KEY não configurada no .env.local' };
    }

    log.info('deepgram_baixando_audio', { audioUrl });

    // 1. Baixar o arquivo de áudio da Evolution API
    const respHttp = await fetch(audioUrl);
    if (!respHttp.ok) {
      return { ok: false, motivo: `Falha ao baixar áudio da Evolution API: ${respHttp.status}` };
    }

    const audioBuffer = await respHttp.arrayBuffer();
    const contentType = respHttp.headers.get('content-type') ?? 'audio/ogg';

    log.info('deepgram_audio_baixado', { bytes: audioBuffer.byteLength, contentType });

    // 2. Chamar o endpoint /v1/listen do Deepgram enviando o binário direto
    const queryParams = new URLSearchParams({
      model: 'nova-2',
      language: 'pt-BR',
      smart_format: 'true',
    });

    const deepgramUrl = `https://api.deepgram.com/v1/listen?${queryParams.toString()}`;

    const response = await fetch(deepgramUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: Buffer.from(audioBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('deepgram_api_erro', { status: response.status, body: errorText });
      return { ok: false, motivo: `Erro na API do Deepgram (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

    log.info('deepgram_transcricao_ok', { chars: transcript.length });
    return { ok: true, texto: transcript.trim() };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    log.error('deepgram_erro_excecao', {
      motivo,
      stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined,
    });
    return { ok: false, motivo };
  }
}

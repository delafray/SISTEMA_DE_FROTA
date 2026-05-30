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

    log.info('deepgram_baixando_audio', { audioUrl: audioUrl.slice(0, 80) });

    // 1. Carrega o áudio. Aceita 2 formas:
    //   a) data URL (Evolution API getBase64FromMediaMessage) — base64 já
    //      DECRIPTADO. Parse direto, sem fetch.
    //   b) URL HTTP(S) — pode ser CDN do WhatsApp com áudio ENCRIPTADO
    //      (não vai funcionar direto). Mas tentamos baixar pra não falhar
    //      cenários de proxy interno.
    let audioBuffer: ArrayBuffer;
    let contentTypeHeader = '';

    if (audioUrl.startsWith('data:')) {
      // Formato: data:<MIME>[;<param>=<val>]*;base64,<dados>
      // Ex Evolution API real: "data:audio/ogg; codecs=opus;base64,XXX"
      //                                       ^^^^^^^^^^^^^^^ param extra
      // Encontra o marcador ";base64," — tudo antes (sem o "data:") e o MIME
      // completo, tudo depois e o conteudo base64.
      const idxBase64 = audioUrl.indexOf(';base64,');
      if (idxBase64 === -1) {
        return { ok: false, motivo: `data URL sem marcador ;base64, (prefixo: ${audioUrl.slice(0, 40)})` };
      }
      contentTypeHeader = audioUrl.slice(5, idxBase64); // pula "data:"
      const base64 = audioUrl.slice(idxBase64 + 8); // pula ";base64,"
      const buf = Buffer.from(base64, 'base64');
      if (buf.byteLength === 0) {
        return { ok: false, motivo: 'data URL com base64 vazio ou invalido' };
      }
      audioBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      log.info('deepgram_audio_data_url', { mime: contentTypeHeader, bytes: audioBuffer.byteLength });
    } else {
      const respHttp = await fetch(audioUrl);
      if (!respHttp.ok) {
        return { ok: false, motivo: `Falha ao baixar áudio da Evolution API: ${respHttp.status}` };
      }
      audioBuffer = await respHttp.arrayBuffer();
      contentTypeHeader = respHttp.headers.get('content-type') ?? '';
    }

    const bytes = new Uint8Array(audioBuffer);

    // Detecta magic number — ajuda a debugar se Evolution devolveu algo
    // diferente de áudio (ex: HTML de erro, JSON, etc).
    // OGG = "OggS", MP3 = "ID3" ou 0xFFFB, WebM/Matroska = 0x1A45DFA3
    let magic = 'unknown';
    if (bytes.length >= 4) {
      const head4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (head4 === 'OggS') magic = 'ogg';
      else if (head4.startsWith('ID3')) magic = 'mp3-id3';
      else if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) magic = 'mp3';
      else if (bytes[0] === 0x1a && bytes[1] === 0x45) magic = 'webm/matroska';
      else if (head4 === 'RIFF') magic = 'wav';
      else magic = `outro (hex: ${[bytes[0], bytes[1], bytes[2], bytes[3]].map((b) => b.toString(16).padStart(2, '0')).join(' ')})`;
    }

    log.info('deepgram_audio_baixado', {
      bytes: audioBuffer.byteLength,
      contentTypeHeader,
      magic,
    });

    if (audioBuffer.byteLength === 0) {
      return { ok: false, motivo: 'Áudio vazio (0 bytes) — Evolution API devolveu nada' };
    }

    // 2. Chamar o endpoint /v1/listen do Deepgram enviando o binário direto.
    //
    // Content-Type FORÇADO para 'audio/ogg' — WhatsApp sempre devolve OGG/Opus,
    // mas Evolution API marca como 'application/octet-stream'. Sem hint correto
    // Deepgram tenta adivinhar e falha com "corrupt or unsupported data".
    //
    // Se o magic não for OGG, mantém o header original (talvez seja MP3/WAV).
    const queryParams = new URLSearchParams({
      model: 'nova-2',
      language: 'pt-BR',
      smart_format: 'true',
    });

    const deepgramUrl = `https://api.deepgram.com/v1/listen?${queryParams.toString()}`;

    const contentType = magic === 'ogg' ? 'audio/ogg' : contentTypeHeader || 'audio/ogg';

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

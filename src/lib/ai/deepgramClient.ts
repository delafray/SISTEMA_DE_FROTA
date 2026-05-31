/**
 * Deepgram Client — serviço de transcrição Speech-to-Text de alta precisão.
 *
 * Modelo: nova-3 (24% menos WER em PT-BR vs nova-2 — Deepgram release notes 2026).
 * Override via DEEPGRAM_MODEL pra rollback rapido sem deploy.
 */

import { createLogger } from '@/lib/logger';
import { comRetry } from './retry';

const log = createLogger('deepgram-client');

export type TranscricaoResultado =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

/**
 * Vocabulario fixo de frota pra boost de transcricao em PT-BR.
 * Termos raros que o motorista usa direto: ferramentas operacionais,
 * jargao de mecanica, vocab logistico. Limite Deepgram: 100 keyterms/request.
 * (Apelidos de caminhao / motorista entram dinamico via tool futura.)
 */
const VOCAB_FROTA_FIXO: readonly string[] = [
  // Hodometro / KM
  'hodometro', 'quilometragem', 'KM', 'rodagem',
  // Combustivel
  'diesel', 'arla', 'arla 32', 'gasolina', 'abastecimento', 'litros', 'bomba',
  // Veiculo / Carroceria
  'cavalo mecanico', 'carreta', 'reboque', 'baú', 'sider', 'graneleiro',
  'caçamba', 'prancha', 'bitrem', 'rodotrem',
  // Manutencao / Mecanica
  'pneu', 'pneus', 'calibragem', 'alinhamento', 'balanceamento',
  'pastilha', 'lonas', 'freio', 'oleo', 'filtro', 'correia',
  'embreagem', 'cambio', 'motor', 'turbina', 'bateria',
  'farol', 'lanterna', 'limpador', 'parabrisa',
  // Operacao
  'pedagio', 'balança', 'fiscalizacao', 'multa', 'CNH',
  'manifesto', 'CTe', 'MDF-e', 'romaneio', 'bordereau', 'nota fiscal', 'NF',
  'entrega', 'descarga', 'carga', 'destinatario', 'remetente',
  // Custos
  'adiantamento', 'acerto', 'despesa', 'diaria', 'pernoite',
  // Estado do caminhao
  'avaria', 'pane', 'panne', 'quebra', 'parado', 'guincho', 'socorro',
  // Pessoas
  'motorista', 'gestor', 'oficina', 'mecanico',
];

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
    //
    // Params nova-3 otimizados (§8.6.1 do BOT_FRAMEWORK):
    //   numerals: 'quarenta e cinco mil' → '45000' (sem regex no lado nosso)
    //   endpointing 500: motorista pausa pra pensar sem cortar a fala
    //   filler_words=false: remove 'é', 'tipo', 'aaah' que atrapalham o LLM
    //   diarize=false: 1 falante so, economia de tokens no payload
    const model = process.env.DEEPGRAM_MODEL ?? 'nova-3';
    const queryParams = new URLSearchParams({
      model,
      language: 'pt-BR',
      smart_format: 'true',
      punctuate: 'true',
      numerals: 'true',
      endpointing: '500',
      filler_words: 'false',
      diarize: 'false',
    });

    // keyterm e exclusivo do nova-3 — boosta termos raros sem penalizar comuns.
    // nova-2 / outros modelos usariam 'keywords' (legacy) — pulamos pra evitar erro.
    if (model.startsWith('nova-3')) {
      for (const termo of VOCAB_FROTA_FIXO) {
        queryParams.append('keyterm', termo);
      }
    }

    const deepgramUrl = `https://api.deepgram.com/v1/listen?${queryParams.toString()}`;

    const contentType = magic === 'ogg' ? 'audio/ogg' : contentTypeHeader || 'audio/ogg';

    // Chamada com retry (5xx/network). 4xx (audio corrompido) NAO retry.
    const response = await comRetry(
      () =>
        fetch(deepgramUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': contentType,
          },
          body: Buffer.from(audioBuffer),
        }).then(async (r) => {
          if (!r.ok && r.status >= 500) {
            // Forca throw em 5xx pra acionar retry
            const body = await r.text().catch(() => '');
            throw new Error(`${r.status} ${body.slice(0, 100)}`);
          }
          return r;
        }),
      { nome: 'deepgram_listen' }
    );

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

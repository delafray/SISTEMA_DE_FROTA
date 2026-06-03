/**
 * Wrapper do OCR (Tesseract.js) — lê o TEXTO de uma foto de nota fiscal.
 *
 * Decisões para funcionar OFFLINE e rápido nas 70 NFs do depósito:
 * - Assets LOCAIS em `/public/tesseract/` (worker, core LSTM, dicionário `por`),
 *   nunca do CDN — senão não roda sem internet. O Service Worker cacheia
 *   `/tesseract/*` (ver swCache.ts). Idioma: português; OEM 1 (LSTM).
 * - Worker SINGLETON: a inicialização custa ~2-3s; criar um por NF seria lento.
 *   Mantemos um vivo e reaproveitamos. `encerrarOcr()` libera ao sair da captura.
 * - `tesseract.js` é carregado por DYNAMIC IMPORT (não pesa no bundle inicial).
 *
 * BROWSER-ONLY (Web Worker + WASM). Em SSR/teste, use mock deste módulo.
 */

// Tipagem mínima do worker (evita acoplar ao tipo exato da lib no import dinâmico).
interface OcrWorker {
  recognize: (img: unknown) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
}

const WORKER_PATH = '/tesseract/worker.min.js';
const LANG_PATH = '/tesseract/'; // tesseract busca `${LANG_PATH}por.traineddata.gz`
const CORE_SIMD = '/tesseract/tesseract-core-simd-lstm.wasm.js';
const CORE_FALLBACK = '/tesseract/tesseract-core-lstm.wasm.js';

let _worker: OcrWorker | null = null;
let _iniciando: Promise<OcrWorker> | null = null;

/** Detecta suporte a WebAssembly SIMD (todos os celulares de ~2021+ têm). */
export function suportaSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
        8, 0, 65, 0, 253, 15, 253, 98, 11,
      ])
    );
  } catch {
    return false;
  }
}

/** Cria (ou reusa) o worker de OCR já carregado com português. */
async function obterWorker(): Promise<OcrWorker> {
  if (_worker) return _worker;
  if (_iniciando) return _iniciando;

  _iniciando = (async () => {
    const { createWorker } = await import('tesseract.js');
    const corePath = suportaSimd() ? CORE_SIMD : CORE_FALLBACK;
    const worker = (await createWorker('por', 1, {
      workerPath: WORKER_PATH,
      langPath: LANG_PATH,
      corePath,
    })) as unknown as OcrWorker;
    _worker = worker;
    _iniciando = null;
    return worker;
  })();

  return _iniciando;
}

export interface ResultadoOCR {
  texto: string;
  confianca: number; // 0-100 (média do Tesseract) — baixa = sugerir reenquadrar
}

/**
 * Roda OCR numa imagem (File/Blob/dataURL/HTMLCanvas...) e devolve o texto bruto.
 * Reusa o worker entre chamadas. Lança se o Tesseract falhar.
 */
export async function lerTextoDaImagem(img: File | Blob | string): Promise<ResultadoOCR> {
  const worker = await obterWorker();
  const { data } = await worker.recognize(img);
  return { texto: data.text ?? '', confianca: data.confidence ?? 0 };
}

/** Encerra o worker e libera memória (chamar ao sair da fase de captura). */
export async function encerrarOcr(): Promise<void> {
  const w = _worker;
  _worker = null;
  _iniciando = null;
  if (w) {
    try {
      await w.terminate();
    } catch {
      /* já encerrado */
    }
  }
}

/** Reseta o singleton sem terminar (uso: testes). */
export function _resetOcrParaTeste(): void {
  _worker = null;
  _iniciando = null;
}

/**
 * Testes do wrapper de OCR — mocka o tesseract.js (createWorker) e valida o
 * singleton de worker, o resultado e o encerramento.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const recognize = vi.fn(async () => ({ data: { text: 'RUA X, 10\nCEP 01310-100', confidence: 87 } }));
const terminate = vi.fn(async () => undefined);
// Tipado com a assinatura real do createWorker do tesseract.js (lang, oem, opts)
// pra que `.mock.calls[0]` venha tipado — a implementação ignora os args.
const createWorker = vi.fn<
  (lang: string, oem: number, opts: Record<string, string>) => Promise<{ recognize: typeof recognize; terminate: typeof terminate }>
>(async () => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({ createWorker }));

import {
  lerTextoDaImagem,
  encerrarOcr,
  suportaSimd,
  _resetOcrParaTeste,
} from '@/lib/ocr/lerImagem';

beforeEach(() => {
  vi.clearAllMocks();
  _resetOcrParaTeste();
});

describe('lerTextoDaImagem', () => {
  it('roda OCR e devolve texto + confiança', async () => {
    const r = await lerTextoDaImagem(new Blob(['x']));
    expect(r.texto).toContain('CEP 01310-100');
    expect(r.confianca).toBe(87);
    expect(recognize).toHaveBeenCalledOnce();
  });

  it('reusa o MESMO worker entre chamadas (singleton) — createWorker uma vez só', async () => {
    await lerTextoDaImagem(new Blob(['a']));
    await lerTextoDaImagem(new Blob(['b']));
    await lerTextoDaImagem(new Blob(['c']));
    expect(createWorker).toHaveBeenCalledOnce();
    expect(recognize).toHaveBeenCalledTimes(3);
  });

  it('carrega português (por) com OEM 1 (LSTM) e assets locais', async () => {
    await lerTextoDaImagem(new Blob(['x']));
    const [lang, oem, opts] = createWorker.mock.calls[0] as [string, number, Record<string, string>];
    expect(lang).toBe('por');
    expect(oem).toBe(1);
    expect(opts.workerPath).toBe('/tesseract/worker.min.js');
    expect(opts.langPath).toBe('/tesseract/');
    expect(opts.corePath).toMatch(/^\/tesseract\/tesseract-core-(simd-)?lstm\.wasm\.js$/);
  });
});

describe('encerrarOcr', () => {
  it('termina o worker e força recriação na próxima leitura', async () => {
    await lerTextoDaImagem(new Blob(['x']));
    await encerrarOcr();
    expect(terminate).toHaveBeenCalledOnce();

    await lerTextoDaImagem(new Blob(['y']));
    expect(createWorker).toHaveBeenCalledTimes(2); // recriou
  });

  it('encerrarOcr sem worker ativo não quebra', async () => {
    await expect(encerrarOcr()).resolves.toBeUndefined();
    expect(terminate).not.toHaveBeenCalled();
  });
});

describe('suportaSimd', () => {
  it('retorna boolean sem lançar', () => {
    expect(typeof suportaSimd()).toBe('boolean');
  });
});

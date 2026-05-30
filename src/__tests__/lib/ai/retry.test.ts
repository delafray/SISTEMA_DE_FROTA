import { describe, it, expect, vi, beforeEach } from 'vitest';
import { comRetry } from '@/lib/ai/retry';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('comRetry', () => {
  it('retorna valor em sucesso na primeira tentativa', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await comRetry(fn);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry em erro de rede (fetch failed)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok');
    const r = await comRetry(fn, { backoffsMs: [10] });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retry em 5xx', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('500 internal server error'))
      .mockResolvedValueOnce('ok');
    const r = await comRetry(fn, { backoffsMs: [10] });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retry em 429 rate limit', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 too many requests'))
      .mockResolvedValueOnce('ok');
    const r = await comRetry(fn, { backoffsMs: [10] });
    expect(r).toBe('ok');
  });

  it('NAO retry em erro 4xx (validacao do cliente)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('400 bad request'));
    await expect(comRetry(fn, { backoffsMs: [10] })).rejects.toThrow('400');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('esgota tentativas e lanca o ultimo erro', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fetch failed permanently'));
    await expect(comRetry(fn, { tentativas: 2, backoffsMs: [5, 5] })).rejects.toThrow('fetch failed permanently');
    expect(fn).toHaveBeenCalledTimes(3); // primeira + 2 retries
  });

  it('respeita opcoes.deveRetentar customizado', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('qualquer coisa'));
    // Nunca retentar
    await expect(comRetry(fn, { deveRetentar: () => false })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

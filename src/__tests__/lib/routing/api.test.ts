/**
 * Testes do cliente de API de roteirização (fetchRota).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRota } from '@/lib/routing/api';

afterEach(() => vi.unstubAllGlobals());

const RESP = { rota: { id: 'r1' }, paradas: [{ id: 'p1' }] };

describe('fetchRota', () => {
  it('devolve { rota, paradas } no sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => RESP })));
    const data = await fetchRota('r1');
    expect(data.rota.id).toBe('r1');
    expect(data.paradas).toHaveLength(1);
  });

  it('chama a URL certa', async () => {
    const spy = vi.fn(async (_url: string | Request, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => RESP }));
    vi.stubGlobal('fetch', spy);
    await fetchRota('abc-123');
    expect(spy.mock.calls[0][0]).toBe('/api/routing/rota/abc-123');
  });

  it('lança em HTTP não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(fetchRota('r1')).rejects.toThrow(/404/);
  });

  it('passa cache:no-store quando noStore=true', async () => {
    const spy = vi.fn(async (_url: string | Request, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => RESP }));
    vi.stubGlobal('fetch', spy);
    await fetchRota('r1', { noStore: true });
    expect(spy.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('não passa options quando noStore ausente', async () => {
    const spy = vi.fn(async (_url: string | Request, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => RESP }));
    vi.stubGlobal('fetch', spy);
    await fetchRota('r1');
    expect(spy.mock.calls[0][1]).toBeUndefined();
  });
});

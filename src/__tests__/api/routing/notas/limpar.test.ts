/**
 * Testes da API route POST /api/routing/notas/limpar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

import { POST } from '@/app/api/routing/notas/limpar/route';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/routing/notas/limpar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/routing/notas/limpar', () => {
  it('400 sem motorista_id ou empresa_id', async () => {
    const res = await POST(makeReq({ motorista_id: 'm1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('params_obrigatorios');
  });

  it('200 e deleta notas no Supabase com status capturada/geocodificada', async () => {
    supabaseFromMock.mockImplementation(() => ({
      delete: () => ({
        eq: (col1: string, val1: string) => {
          expect(col1).toBe('motorista_id');
          expect(val1).toBe('m1');
          return {
            eq: (col2: string, val2: string) => {
              expect(col2).toBe('empresa_id');
              expect(val2).toBe('e1');
              return {
                in: (col3: string, val3: string[]) => {
                  expect(col3).toBe('status');
                  expect(val3).toEqual(['capturada', 'geocodificada']);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      }),
    }));

    const res = await POST(makeReq({ motorista_id: 'm1', empresa_id: 'e1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('500 em erro de banco', async () => {
    supabaseFromMock.mockImplementation(() => ({
      delete: () => ({
        eq: () => ({
          eq: () => ({
            in: () => Promise.resolve({ error: { code: 'XX', message: 'db error' } }),
          }),
        }),
      }),
    }));

    const res = await POST(makeReq({ motorista_id: 'm1', empresa_id: 'e1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db_delete_failed');
  });
});

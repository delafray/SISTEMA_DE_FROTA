/**
 * Testes da API route POST /api/motorista/atualizar-km — atualização de KM
 * pelo app do motorista (km_logs + trigger propaga pro veiculos.km_atual).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

const persistirMock = vi.fn();
vi.mock('@/lib/storage/r2', () => ({
  persistirMidiaNoR2: (...args: unknown[]) => persistirMock(...args),
  chaveMidia: vi.fn(() => 'km/e1/uuid.jpg'),
}));

import { POST } from '@/app/api/motorista/atualizar-km/route';

// Rotas de API exigem sessão (requireSessao); nos testes, usuário sempre logado.
vi.mock('@/lib/auth/requireSessao', () => ({
  requireSessao: async () => ({ user: { id: 'user-teste' }, erro: null }),
}));

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/motorista/atualizar-km', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BODY_OK = { veiculo_id: 'v1', motorista_id: 'm1', empresa_id: 'e1', km: 152340 };

let insertPayload: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  insertPayload = null;
  supabaseFromMock.mockImplementation(() => ({
    insert: (payload: Record<string, unknown>) => {
      insertPayload = payload;
      return Promise.resolve({ error: null });
    },
  }));
  persistirMock.mockResolvedValue('https://r2.example/km/foto.jpg');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/motorista/atualizar-km', () => {
  it('400 quando faltam campos obrigatórios', async () => {
    const res = await POST(makeReq({ veiculo_id: 'v1', km: 100 }));
    expect(res.status).toBe(400);
    expect((await res.json()).erro).toBe('campos_obrigatorios');
  });

  it('400 quando km é inválido (zero, negativo ou não-número)', async () => {
    for (const km of [0, -5, 'abc', null]) {
      const res = await POST(makeReq({ ...BODY_OK, km }));
      expect(res.status).toBe(400);
      expect((await res.json()).erro).toBe('km_invalido');
    }
  });

  it('201 sem foto: insere km_logs como checkpoint confirmado (trigger propaga)', async () => {
    const res = await POST(makeReq(BODY_OK));

    expect(res.status).toBe(201);
    expect((await res.json()).ok).toBe(true);
    expect(supabaseFromMock).toHaveBeenCalledWith('km_logs');
    expect(insertPayload).toMatchObject({
      veiculo_id: 'v1',
      motorista_id: 'm1',
      empresa_id: 'e1',
      km_lido: 152340,
      tipo: 'checkpoint',
      confirmado: true,
      correcao: false,
      foto_urls: null,
    });
    expect(persistirMock).not.toHaveBeenCalled();
  });

  it('201 com foto: sobe pro R2 e grava a URL em foto_urls', async () => {
    const res = await POST(makeReq({ ...BODY_OK, foto_data_url: 'data:image/jpeg;base64,xxx' }));

    expect(res.status).toBe(201);
    expect(persistirMock).toHaveBeenCalledWith('data:image/jpeg;base64,xxx', 'km/e1/uuid.jpg');
    expect(insertPayload?.foto_urls).toEqual(['https://r2.example/km/foto.jpg']);
  });

  it('201 mesmo se o upload da foto falhar (foto é opcional, não derruba o KM)', async () => {
    persistirMock.mockRejectedValue(new Error('r2 down'));

    const res = await POST(makeReq({ ...BODY_OK, foto_data_url: 'data:image/jpeg;base64,xxx' }));

    expect(res.status).toBe(201);
    expect(insertPayload?.foto_urls).toBeNull();
  });

  it('409 km_retroativo quando o trigger bloqueia KM menor que o atual', async () => {
    supabaseFromMock.mockImplementation(() => ({
      insert: () => Promise.resolve({ error: { message: 'KM retroativo: menor que km_atual do veiculo' } }),
    }));

    const res = await POST(makeReq(BODY_OK));

    expect(res.status).toBe(409);
    expect((await res.json()).erro).toBe('km_retroativo');
  });

  it('500 em erro genérico de banco', async () => {
    supabaseFromMock.mockImplementation(() => ({
      insert: () => Promise.resolve({ error: { message: 'connection reset' } }),
    }));

    const res = await POST(makeReq(BODY_OK));

    expect(res.status).toBe(500);
    expect((await res.json()).erro).toBe('db_km_insert');
  });
});

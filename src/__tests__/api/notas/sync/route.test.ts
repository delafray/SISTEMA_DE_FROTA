/**
 * Testes da API route POST /api/notas/sync.
 * Mocka Supabase, monta NextRequest manualmente, chama o handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── ENV ────────────────────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const supabaseFromMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import { POST } from '@/app/api/notas/sync/route';
import { NextRequest } from 'next/server';

// ─── HELPERS ────────────────────────────────────────────────────────────

function payloadValido(over: Record<string, unknown> = {}) {
  return {
    id_local: 'local-abc',
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '123',
    endereco: {
      logradouro: 'Av Paulista',
      bairro: 'Bela Vista',
      cidade: 'Sao Paulo',
      uf: 'SP',
    },
    capturado_em: '2026-05-27T20:00:00Z',
    ...over,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notas/sync', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockInsertOk(idServidor: string) {
  const single = vi.fn().mockResolvedValue({ data: { id: idServidor }, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  supabaseFromMock.mockReturnValue({ insert });
  return { insert, select, single };
}

function mockInsertError(error: { code: string; message: string }) {
  const single = vi.fn().mockResolvedValue({ data: null, error });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  supabaseFromMock.mockReturnValue({ insert });
  return { insert };
}

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/notas/sync — sucesso', () => {
  it('payload valido → 201 com id_servidor + insert no supabase', async () => {
    const { insert } = mockInsertOk('srv-uuid-1');

    const res = await POST(makeRequest(payloadValido()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id_servidor: 'srv-uuid-1' });

    expect(insert).toHaveBeenCalledOnce();
    const insertedRow = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.motorista_id).toBe('mot-1');
    expect(insertedRow.cep).toBe('01310100');
    expect(insertedRow.status).toBe('capturada');
    expect(insertedRow.sincronizado_em).toBeDefined();
  });

  it('lat/lng/observacao opcionais — defaults null', async () => {
    const { insert } = mockInsertOk('srv-1');

    await POST(makeRequest(payloadValido({ latitude: undefined, longitude: undefined, observacao: undefined })));

    const insertedRow = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.latitude).toBeNull();
    expect(insertedRow.longitude).toBeNull();
    expect(insertedRow.observacao).toBeNull();
  });

  it('passa lat/lng quando fornecidos', async () => {
    const { insert } = mockInsertOk('srv-1');

    await POST(makeRequest(payloadValido({ latitude: -23.5505, longitude: -46.6333 })));

    const insertedRow = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.latitude).toBe(-23.5505);
    expect(insertedRow.longitude).toBe(-46.6333);
  });
});

describe('POST /api/notas/sync — validacao 400', () => {
  it('JSON invalido → 400 json_invalido', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('json_invalido');
  });

  it('campo motorista_id faltando → 400 campos_faltando com lista', async () => {
    const payload: Record<string, unknown> = payloadValido();
    delete payload.motorista_id;

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('campos_faltando');
    expect(body.detail).toContain('motorista_id');
  });

  it('multiplos campos faltando lista todos', async () => {
    const res = await POST(makeRequest({ id_local: 'a' } as Record<string, unknown>));
    const body = await res.json();
    expect(body.detail).toEqual(
      expect.arrayContaining(['motorista_id', 'empresa_id', 'cep', 'numero', 'endereco', 'capturado_em'])
    );
  });

  it('CEP com formato invalido → 400 cep_formato_invalido', async () => {
    const res = await POST(makeRequest(payloadValido({ cep: '01310-100' }))); // com hifen
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('cep_formato_invalido');
  });

  it('CEP com menos de 8 digitos → 400', async () => {
    const res = await POST(makeRequest(payloadValido({ cep: '0131010' })));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/notas/sync — erro 500', () => {
  it('falha no insert do supabase → 500 com detail', async () => {
    mockInsertError({ code: '23505', message: 'duplicate key' });

    const res = await POST(makeRequest(payloadValido()));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('db_insert_failed');
    expect(body.detail).toBe('duplicate key');
  });
});

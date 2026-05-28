/**
 * Testes da API route GET /api/cep/[cep].
 * Mocka consultarCEP do viacep.ts, valida que status HTTP mapeia certo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/cep/viacep', () => ({
  consultarCEP: vi.fn(),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import { GET } from '@/app/api/cep/[cep]/route';
import { consultarCEP } from '@/lib/cep/viacep';
import { NextRequest } from 'next/server';

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeReq() {
  return new NextRequest('http://localhost/api/cep/01310100');
}

function makeParams(cep: string) {
  return { params: Promise.resolve({ cep }) };
}

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/cep/[cep]', () => {
  it('200 com body do ResultadoCEP em sucesso', async () => {
    (consultarCEP as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      cep: '01310100',
      endereco: { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP' },
      fonte: 'cache',
    });

    const res = await GET(makeReq(), makeParams('01310100'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.endereco.cidade).toBe('Sao Paulo');
    expect(consultarCEP).toHaveBeenCalledWith('01310100');
  });

  it('400 quando CEP invalido', async () => {
    (consultarCEP as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'cep_invalido',
    });

    const res = await GET(makeReq(), makeParams('xxx'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.motivo).toBe('cep_invalido');
  });

  it('400 quando CEP nao encontrado', async () => {
    (consultarCEP as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'nao_encontrado',
    });

    const res = await GET(makeReq(), makeParams('99999999'));

    expect(res.status).toBe(400);
  });

  it('503 em erro_rede (problema upstream do ViaCEP)', async () => {
    (consultarCEP as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'erro_rede',
    });

    const res = await GET(makeReq(), makeParams('01310100'));

    expect(res.status).toBe(503);
  });

  it('503 em timeout', async () => {
    (consultarCEP as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      motivo: 'timeout',
    });

    const res = await GET(makeReq(), makeParams('01310100'));

    expect(res.status).toBe(503);
  });
});

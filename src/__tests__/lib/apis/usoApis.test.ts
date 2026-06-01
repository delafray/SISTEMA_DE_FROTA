/**
 * Testes de usoApis — coleta de uso (mock supabase + lerUsoMes) e a lógica
 * pura de % + ordenação (montarLinhasUso).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';

// lerUsoMes (Google Geocoding) — mockado.
const lerUsoMesMock = vi.fn();
vi.mock('@/lib/routing/geocodeCache', () => ({
  lerUsoMes: () => lerUsoMesMock(),
}));

// Supabase: cada select(count).in/eq().gte() resolve um count controlável.
const countGeminiHoje = { value: 0 };
const countDeepgramMes = { value: 0 };
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          gte: vi.fn(async () => ({ count: countGeminiHoje.value, error: null })),
        })),
        eq: vi.fn(() => ({
          gte: vi.fn(async () => ({ count: countDeepgramMes.value, error: null })),
        })),
      })),
    })),
  })),
}));

import {
  coletarUsoApis,
  montarLinhasUso,
  inicioDiaUTC,
  inicioMesUTC,
  type UsoMedido,
} from '@/lib/apis/usoApis';
import { CATALOGO_APIS } from '@/lib/apis/catalogoApis';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  lerUsoMesMock.mockResolvedValue({ mes: '2026-06', total: 4900, limite: 9800 });
  countGeminiHoje.value = 0;
  countDeepgramMes.value = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inicioDiaUTC / inicioMesUTC', () => {
  it('início do dia e do mês em UTC ISO', () => {
    const d = new Date('2026-06-15T13:45:00Z');
    expect(inicioDiaUTC(d)).toBe('2026-06-15T00:00:00.000Z');
    expect(inicioMesUTC(d)).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('coletarUsoApis', () => {
  it('junta Google (lerUsoMes), Gemini hoje e Deepgram no mês', async () => {
    countGeminiHoje.value = 37;
    countDeepgramMes.value = 12;
    const uso = await coletarUsoApis(new Date('2026-06-15T10:00:00Z'));
    expect(uso.googleGeocoding).toEqual({ total: 4900, limite: 9800 });
    expect(uso.geminiHoje.total).toBe(37);
    expect(uso.geminiHoje.limite).toBe(250); // default
    expect(uso.deepgramMes.total).toBe(12);
  });
});

describe('montarLinhasUso', () => {
  const uso: UsoMedido = {
    googleGeocoding: { total: 4900, limite: 9800 }, // 50%
    geminiHoje: { total: 225, limite: 250 },         // 90% → crítico
    deepgramMes: { total: 8 },                       // sem %
  };

  it('calcula % e status das medidas', () => {
    const linhas = montarLinhasUso(CATALOGO_APIS, uso);
    const google = linhas.find((l) => l.id === 'google_geocoding')!;
    const gemini = linhas.find((l) => l.id === 'gemini')!;
    const deepgram = linhas.find((l) => l.id === 'deepgram')!;

    expect(google.pct).toBe(50);
    expect(google.status).toBe('ok');
    expect(google.usoLabel).toMatch(/4\.900 \/ 9\.800 este mês/);

    expect(gemini.pct).toBe(90);
    expect(gemini.status).toBe('critico');
    expect(gemini.usoLabel).toBe('225 / 250 hoje');

    expect(deepgram.pct).toBeNull();
    expect(deepgram.usoLabel).toBe('8 áudios este mês');
  });

  it('ordena: com % primeiro (maior→menor), depois os sem medição', () => {
    const linhas = montarLinhasUso(CATALOGO_APIS, uso);
    // 1º = gemini (90%), 2º = google (50%), depois os neutros
    expect(linhas[0].id).toBe('gemini');
    expect(linhas[1].id).toBe('google_geocoding');
    // Todos os sem-% vêm depois dos com-%
    const idxPrimeiroNeutro = linhas.findIndex((l) => l.pct === null);
    const idxUltimoComPct = linhas.map((l) => l.pct).lastIndexOf(
      linhas.filter((l) => l.pct !== null).map((l) => l.pct).pop() ?? null,
    );
    expect(idxPrimeiroNeutro).toBeGreaterThan(idxUltimoComPct);
  });

  it('todas as entradas do catálogo viram linha', () => {
    expect(montarLinhasUso(CATALOGO_APIS, uso)).toHaveLength(CATALOGO_APIS.length);
  });

  it('% nunca passa de 100 (estouro de cota)', () => {
    const estourado: UsoMedido = {
      googleGeocoding: { total: 12000, limite: 9800 },
      geminiHoje: { total: 0, limite: 250 },
      deepgramMes: { total: 0 },
    };
    const google = montarLinhasUso(CATALOGO_APIS, estourado).find((l) => l.id === 'google_geocoding')!;
    expect(google.pct).toBe(100);
    expect(google.status).toBe('critico');
  });
});

/**
 * Testes da guarda de cota do Gemini (RPM/RPD) — Camada 1 da resiliência.
 * Mocka o Supabase (contagens de bot_metricas).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cada query é: from('bot_metricas').select(...).in('modo', ...).gte('created_at', x)
// → awaitável resolvendo { count }. gteMock controla o count retornado por chamada.
const gteMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({ gte: gteMock }),
      }),
    }),
  }),
}));

import { cotaGeminiDisponivel } from '@/lib/whatsapp/geminiRateLimit';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Promise.all roda [dia, minuto] nessa ordem → 1ª chamada=dia, 2ª=minuto. */
function contagens(dia: number, minuto: number) {
  gteMock.mockResolvedValueOnce({ count: dia }).mockResolvedValueOnce({ count: minuto });
}

describe('cotaGeminiDisponivel', () => {
  it('dentro dos limites → ok', async () => {
    contagens(100, 5); // dia 100/250, minuto 5/15
    expect(await cotaGeminiDisponivel()).toEqual({ ok: true });
  });

  it('estourou o DIA (RPD) → ok:false motivo rpd', async () => {
    contagens(250, 0);
    expect(await cotaGeminiDisponivel()).toEqual({ ok: false, motivo: 'rpd' });
  });

  it('dia ok mas estourou o MINUTO (RPM) → ok:false motivo rpm', async () => {
    contagens(50, 15);
    expect(await cotaGeminiDisponivel()).toEqual({ ok: false, motivo: 'rpm' });
  });

  it('RPD tem precedência sobre RPM (checa o dia primeiro)', async () => {
    contagens(250, 15); // ambos estourados
    expect(await cotaGeminiDisponivel()).toEqual({ ok: false, motivo: 'rpd' });
  });

  it('respeita limites custom de env (GEMINI_RPM/GEMINI_RPD)', async () => {
    vi.stubEnv('GEMINI_RPM', '3');
    vi.stubEnv('GEMINI_RPD', '10');
    contagens(2, 3); // minuto bate o RPM=3
    expect(await cotaGeminiDisponivel()).toEqual({ ok: false, motivo: 'rpm' });
  });

  it('erro na contagem → FAIL-OPEN (libera, não trava o bot)', async () => {
    gteMock.mockRejectedValue(new Error('db down'));
    expect(await cotaGeminiDisponivel()).toEqual({ ok: true });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyEvolutionSignature } from '@/lib/whatsapp/security';

const SECRET = 'frota-webhook-secret-fake';

describe('verifyEvolutionSignature', () => {
  const originalEnv = process.env.EVOLUTION_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.EVOLUTION_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EVOLUTION_WEBHOOK_SECRET;
    } else {
      process.env.EVOLUTION_WEBHOOK_SECRET = originalEnv;
    }
  });

  it('aceita token correto no header apikey', () => {
    const result = verifyEvolutionSignature(SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('verified');
  });

  it('rejeita token incorreto', () => {
    const result = verifyEvolutionSignature('token-errado');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mismatch');
  });

  it('rejeita quando header está ausente (null)', () => {
    const result = verifyEvolutionSignature(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-header');
  });

  it('pula validação quando EVOLUTION_WEBHOOK_SECRET não está configurado', () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    const result = verifyEvolutionSignature(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('skipped-no-secret');
  });

  it('pula validação sem segredo mesmo com header presente', () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    const result = verifyEvolutionSignature('qualquer-token');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('skipped-no-secret');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyMetaSignature } from '@/lib/whatsapp/security';

const SECRET = 'minha-app-secret-fake';
const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

function signedHeader(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

describe('verifyMetaSignature', () => {
  const originalEnv = process.env.META_APP_SECRET;

  beforeEach(() => {
    process.env.META_APP_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.META_APP_SECRET;
    } else {
      process.env.META_APP_SECRET = originalEnv;
    }
  });

  it('aceita assinatura válida', () => {
    const header = signedHeader(body, SECRET);
    const result = verifyMetaSignature(body, header);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('verified');
  });

  it('rejeita assinatura inválida', () => {
    const header = signedHeader(body, 'outro-secret');
    const result = verifyMetaSignature(body, header);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mismatch');
  });

  it('rejeita quando header está ausente', () => {
    const result = verifyMetaSignature(body, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-header');
  });

  it('rejeita header sem prefixo sha256=', () => {
    const result = verifyMetaSignature(body, 'abcdef');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed-header');
  });

  it('rejeita quando corpo foi modificado', () => {
    const header = signedHeader(body, SECRET);
    const result = verifyMetaSignature(body + 'tampered', header);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mismatch');
  });

  it('pula validação quando META_APP_SECRET não está configurado', () => {
    delete process.env.META_APP_SECRET;
    const result = verifyMetaSignature(body, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe('skipped-no-secret');
  });

  it('rejeita hex de tamanho diferente sem lançar exceção', () => {
    const result = verifyMetaSignature(body, 'sha256=abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mismatch');
  });
});

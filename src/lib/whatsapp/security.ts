import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureResult =
  | { ok: true; mode: 'verified' | 'skipped-no-secret' }
  | { ok: false; reason: 'missing-header' | 'malformed-header' | 'mismatch' };

/**
 * Valida o header `X-Hub-Signature-256` enviado pela Meta.
 * Quando `META_APP_SECRET` não está configurado, retorna `skipped-no-secret`
 * para permitir desenvolvimento local sem quebrar o webhook.
 */
export function verifyMetaSignature(rawBody: string, headerValue: string | null): SignatureResult {
  const secret = process.env.META_APP_SECRET;

  if (!secret) {
    return { ok: true, mode: 'skipped-no-secret' };
  }

  if (!headerValue) {
    return { ok: false, reason: 'missing-header' };
  }

  const prefix = 'sha256=';
  if (!headerValue.startsWith(prefix)) {
    return { ok: false, reason: 'malformed-header' };
  }

  const provided = headerValue.slice(prefix.length).trim();
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const providedBuf = Buffer.from(provided, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: 'mismatch' };
  }

  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, mode: 'verified' };
}

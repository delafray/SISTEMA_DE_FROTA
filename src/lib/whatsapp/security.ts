/**
 * WhatsApp Security — Valida requisições recebidas da Evolution API.
 *
 * A Evolution API não usa HMAC como a Meta. A autenticação é feita via
 * um token secreto que você define na configuração do webhook da Evolution API.
 * O token é enviado no header `apikey` de cada requisição POST.
 */

export type SignatureResult =
  | { ok: true; mode: 'verified' | 'skipped-no-secret' }
  | { ok: false; reason: 'missing-header' | 'mismatch' };

/**
 * Valida o header `apikey` enviado pela Evolution API em cada webhook.
 * Quando `EVOLUTION_WEBHOOK_SECRET` não está configurado, retorna `skipped-no-secret`
 * para permitir desenvolvimento local sem quebrar o webhook.
 */
export function verifyEvolutionSignature(headerValue: string | null): SignatureResult {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (!secret) {
    return { ok: true, mode: 'skipped-no-secret' };
  }

  if (!headerValue) {
    return { ok: false, reason: 'missing-header' };
  }

  if (headerValue !== secret) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, mode: 'verified' };
}

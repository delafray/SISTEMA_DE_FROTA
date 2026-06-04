/**
 * Criptografia simétrica (AES-256-GCM) para os cadastros sensíveis da página
 * /uso-apis (email da conta + final do cartão). SERVER-ONLY (usa `crypto` do Node
 * e a chave secreta de ambiente).
 *
 * - Chave: derivada de `USO_APIS_ENC_KEY` por SHA-256 (vira 32 bytes), então a env
 *   pode ser qualquer string longa. Defina uma frase aleatória forte na Vercel.
 * - Formato do blob: base64( iv[12] | authTag[16] | ciphertext ). O GCM já autentica
 *   — adulterar o blob faz o decifrar lançar (não devolve lixo silenciosamente).
 *
 * Os 4 últimos dígitos do cartão não são dado sigiloso por norma (PCI permite), mas
 * ciframos mesmo assim por defesa em profundidade: se o banco vazar, fica ilegível.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Deriva uma chave de 32 bytes a partir do segredo de ambiente. */
function chave(): Buffer {
  const segredo = process.env.USO_APIS_ENC_KEY;
  if (!segredo) {
    throw new Error('USO_APIS_ENC_KEY não configurada — defina uma frase secreta forte no ambiente.');
  }
  return crypto.createHash('sha256').update(segredo, 'utf8').digest();
}

/** Cifra um texto em claro → blob base64 (iv|tag|ciphertext). */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, chave(), iv);
  const ct = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Decifra um blob base64 produzido por `cifrar`. Lança se a chave/blob não baterem. */
export function decifrar(blob: string): string {
  const raw = Buffer.from(blob, 'base64');
  if (raw.length < IV_LEN + TAG_LEN) {
    throw new Error('blob cifrado inválido (curto demais)');
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

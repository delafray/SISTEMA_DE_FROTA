/**
 * Upload de mídia (fotos de avaria/cupom/odômetro do bot WhatsApp) pro Cloudflare R2.
 *
 * POR QUÊ: hoje os fluxos guardam em `foto_url` o que o `getMediaUrl` devolve — que
 * é uma URL temporária do WhatsApp (expira) OU uma **data URL base64** (a imagem
 * inteira como texto, inchando o Postgres). Subindo pro R2 a gente guarda no banco
 * só a **URL pública curta** (10GB grátis, egress zero).
 *
 * PASSTHROUGH (importante): se o R2 NÃO estiver configurado (sem env `R2_*`) ou se o
 * upload falhar, devolve a própria URL/data-url recebida. Assim NÃO há regressão até
 * as chaves serem setadas, e nunca se perde a referência por um hiccup. Com o R2
 * configurado, sobe os bytes e devolve a URL pública.
 *
 * SERVER-ONLY (usa `@aws-sdk/client-s3` + node `crypto`). Nunca importar no client.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('r2');

/** Cria o client S3 apontado pro R2, ou null se não configurado. */
function getClient(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Gera uma chave única no bucket: `<tipo>/<empresa>/<uuid>.<ext>`. */
export function chaveMidia(tipo: string, empresaId: string | null | undefined, ext = 'jpg'): string {
  return `${tipo}/${empresaId ?? 'sem-empresa'}/${randomUUID()}.${ext}`;
}

/** Extrai bytes + content-type de uma data URL base64 ou de uma URL http(s). */
async function obterBytes(urlOuDataUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (urlOuDataUrl.startsWith('data:')) {
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(urlOuDataUrl);
    if (!m) return null;
    return { buffer: Buffer.from(m[2], 'base64'), contentType: m[1] };
  }
  if (urlOuDataUrl.startsWith('http')) {
    const res = await fetch(urlOuDataUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }
  return null;
}

/**
 * Sobe a mídia pro R2 e devolve a URL pública. Se o R2 não estiver configurado ou
 * der erro, faz PASSTHROUGH (devolve a entrada) — não quebra o fluxo nem perde a ref.
 */
export async function persistirMidiaNoR2(urlOuDataUrl: string | null, chave: string): Promise<string | null> {
  if (!urlOuDataUrl) return null;

  const client = getClient();
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!client || !bucket || !publicUrl) {
    return urlOuDataUrl; // R2 não configurado → passthrough (sem regressão)
  }

  try {
    const bytes = await obterBytes(urlOuDataUrl);
    if (!bytes) {
      log.warn('r2_bytes_invalidos', { chave });
      return urlOuDataUrl;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        Body: bytes.buffer,
        ContentType: bytes.contentType,
      })
    );
    return `${publicUrl.replace(/\/+$/, '')}/${chave}`;
  } catch (err) {
    log.error('r2_upload_falhou', { chave, error: (err as Error).message });
    return urlOuDataUrl; // erro → passthrough (não perde a foto)
  }
}

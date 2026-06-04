/**
 * Testes do helper de upload pro R2 (fotos do bot).
 * Mocka @aws-sdk/client-s3; valida passthrough (sem config / erro) e upload real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(...a: unknown[]) {
      return sendMock(...a);
    }
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { persistirMidiaNoR2, chaveMidia } from '@/lib/storage/r2';

const DATA_URL = 'data:image/jpeg;base64,' + Buffer.from('fake-image-bytes').toString('base64');

function configurarR2() {
  vi.stubEnv('R2_ACCOUNT_ID', 'acc123');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('R2_BUCKET_NAME', 'frota-storage');
  vi.stubEnv('R2_PUBLIC_URL', 'https://pub-xxxx.r2.dev');
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue({});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chaveMidia', () => {
  it('gera chave <tipo>/<empresa>/<uuid>.jpg', () => {
    const k = chaveMidia('avarias', 'emp-1');
    expect(k).toMatch(/^avarias\/emp-1\/[0-9a-f-]{36}\.jpg$/);
  });
  it('empresa nula vira "sem-empresa"', () => {
    expect(chaveMidia('km', null)).toMatch(/^km\/sem-empresa\//);
  });
});

describe('persistirMidiaNoR2', () => {
  it('null entra → null sai', async () => {
    expect(await persistirMidiaNoR2(null, 'k.jpg')).toBeNull();
  });

  it('SEM R2 configurado → passthrough (devolve a entrada, sem upload)', async () => {
    const r = await persistirMidiaNoR2(DATA_URL, 'avarias/emp/x.jpg');
    expect(r).toBe(DATA_URL);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('COM R2 configurado + data URL → sobe e devolve URL pública curta', async () => {
    configurarR2();
    const r = await persistirMidiaNoR2(DATA_URL, 'avarias/emp/x.jpg');
    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0] as { input: { Bucket: string; Key: string; ContentType: string; Body: Buffer } };
    expect(cmd.input.Bucket).toBe('frota-storage');
    expect(cmd.input.Key).toBe('avarias/emp/x.jpg');
    expect(cmd.input.ContentType).toBe('image/jpeg');
    expect(r).toBe('https://pub-xxxx.r2.dev/avarias/emp/x.jpg');
  });

  it('erro no upload → passthrough (não perde a referência)', async () => {
    configurarR2();
    sendMock.mockRejectedValue(new Error('r2 down'));
    const r = await persistirMidiaNoR2(DATA_URL, 'k.jpg');
    expect(r).toBe(DATA_URL);
  });

  it('configurado mas entrada não é data/http → passthrough', async () => {
    configurarR2();
    const r = await persistirMidiaNoR2('id-cru-sem-protocolo', 'k.jpg');
    expect(r).toBe('id-cru-sem-protocolo');
    expect(sendMock).not.toHaveBeenCalled();
  });
});

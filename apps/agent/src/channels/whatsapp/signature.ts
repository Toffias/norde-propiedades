import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida el header `X-Hub-Signature-256` de Meta: `sha256=` + HMAC-SHA256(appSecret, body).
 * Se calcula sobre el body **crudo**, no sobre el JSON re-serializado.
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const received = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function signBody(rawBody: Buffer | string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

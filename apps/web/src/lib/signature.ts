import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida una firma `sha256=` + HMAC-SHA256(secret, body) en hexadecimal, la de los avisos que
 * manda apps/gestion. Se calcula sobre el body **crudo**, no sobre el JSON re-serializado.
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const received = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

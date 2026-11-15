import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida una firma `sha256=` + HMAC-SHA256(secret, body) en hexadecimal, la de los avisos que
 * manda apps/gestion. Se calcula sobre el body **crudo**, no sobre el JSON re-serializado.
 */
/** Cuánto puede diferir la fecha de un aviso firmado del reloj de la web. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

/**
 * Valida una firma con fecha (`x-norde-timestamp`, en milisegundos): HMAC de
 * `<timestamp>.<body crudo>`. Un aviso capturado no se puede reenviar pasados unos minutos, y
 * cambiar la fecha invalida la firma.
 */
export function verifyTimestampedSignature(input: {
  readonly rawBody: Buffer;
  readonly timestamp: string | null | undefined;
  readonly signature: string | null | undefined;
  readonly secret: string;
  readonly now: number;
}): boolean {
  const { timestamp } = input;
  if (!timestamp || !/^\d{1,15}$/.test(timestamp)) return false;
  if (Math.abs(input.now - Number(timestamp)) > SIGNATURE_TOLERANCE_MS) return false;
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`), input.rawBody]);
  return verifySignature(signed, input.signature, input.secret);
}

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

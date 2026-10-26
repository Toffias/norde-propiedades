import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida una firma `sha256=` + HMAC-SHA256(secret, body) en hexadecimal: la del header
 * `X-Hub-Signature-256` de Meta y la de los webhooks propios. Se calcula sobre el body **crudo**,
 * no sobre el JSON re-serializado.
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

/** Cuánto puede diferir la fecha de un mensaje firmado del reloj del agente. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

/** Lo que se firma en un mensaje con fecha: `<timestamp>.<body>`. */
function timestamped(rawBody: Buffer | string, timestamp: string): Buffer {
  return Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(rawBody)]);
}

export function signTimestamped(rawBody: Buffer | string, timestamp: string, secret: string) {
  return signBody(timestamped(rawBody, timestamp), secret);
}

/**
 * Valida una firma propia con fecha (`x-norde-timestamp`, en milisegundos): un mensaje capturado
 * no se puede reenviar pasados unos minutos, y cambiar la fecha invalida la firma.
 */
export function verifyTimestampedSignature(input: {
  readonly rawBody: Buffer;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
  readonly secret: string;
  readonly now: number;
}): boolean {
  const { timestamp } = input;
  if (!timestamp || !/^\d{1,15}$/.test(timestamp)) return false;
  if (Math.abs(input.now - Number(timestamp)) > SIGNATURE_TOLERANCE_MS) return false;
  return verifySignature(timestamped(input.rawBody, timestamp), input.signature, input.secret);
}

/** Compara dos secretos en tiempo constante (solo se filtra si el largo coincide). */
export function safeEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

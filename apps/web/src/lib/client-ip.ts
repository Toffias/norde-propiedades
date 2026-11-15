import 'server-only';

import { headers } from 'next/headers';

import { rateLimitKey } from './rate-limit';

/**
 * El IP de quien envía. Nginx, en el mismo servidor, es el único proxy: agrega el IP real al
 * final de `X-Forwarded-For`, así que lo que vino antes lo pudo escribir cualquiera.
 */
async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? list.get('x-real-ip') ?? '';
}

/** La clave de los límites por IP: el IPv4 o el /64 del IPv6 (ver `rateLimitKey`). */
export async function clientRateKey(): Promise<string> {
  return rateLimitKey(await clientIp());
}

import 'server-only';

import { headers } from 'next/headers';

/**
 * El IP de quien envía. Nginx, en el mismo servidor, es el único proxy: agrega el IP real al
 * final de `X-Forwarded-For`, así que lo que vino antes lo pudo escribir cualquiera.
 */
export async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? list.get('x-real-ip') ?? '';
}

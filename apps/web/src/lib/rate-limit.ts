import { isIPv4, isIPv6 } from 'node:net';

const WINDOW_MS = 10 * 60_000;

/**
 * Límite de envíos por clave (el IP, ver `rateLimitKey`) en ventanas fijas (10 minutos por
 * defecto), en memoria: la web corre en una sola instancia. Frena a quien manda un formulario o el
 * chat en loop antes de que llegue al backend. `cost`: cuánto suma este envío (una consulta de
 * favoritos son varias consultas).
 */
export function createRateLimiter(max: number, now: () => number, windowMs = WINDOW_MS) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string, cost = 1): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) if (at - window.start >= windowMs) windows.delete(ip);
    }
    const current = windows.get(key);
    if (!current || at - current.start >= windowMs) {
      windows.set(key, { start: at, count: cost });
      return cost <= max;
    }
    current.count += cost;
    return current.count <= max;
  };
}

/** Los primeros 4 grupos (64 bits) de un IPv6 ya validado, con `::` expandido. */
function ipv6Prefix64(ip: string): string[] {
  const [head = '', tail] = ip.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => '0'), ...right];
  return groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''));
}

/**
 * La clave del límite para un IP. Un IPv4 es su propia clave; un IPv6 se agrupa por su /64, que es
 * lo que un proveedor le da a un solo cliente: si no, rotando dentro de ese rango se esquiva el
 * límite. Un IPv4 mapeado (`::ffff:1.2.3.4`) cuenta como IPv4.
 */
export function rateLimitKey(ip: string): string {
  const address =
    ip
      .trim()
      .replace(/^\[|\]$/g, '')
      .split('%')[0] ?? '';
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)?.[1];
  if (mapped !== undefined && isIPv4(mapped)) return mapped;
  return `${ipv6Prefix64(address).join(':')}::/64`;
}

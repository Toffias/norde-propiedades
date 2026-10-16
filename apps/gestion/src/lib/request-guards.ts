// Defensas de los endpoints públicos (webhooks): el IP del cliente y un rate limit por IP.

const RATE_WINDOW_MS = 60_000;

/**
 * El IP del cliente. Nginx, en el mismo servidor, es el único proxy: agrega el IP real al final
 * de `X-Forwarded-For`, así que lo que vino antes lo pudo escribir cualquiera.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Ventana fija de un minuto por IP, en memoria: el panel corre en una sola instancia (ADR 0021). */
export function createRateLimiter(max: number, now: () => number) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) {
        if (at - window.start >= RATE_WINDOW_MS) windows.delete(ip);
      }
    }
    const current = windows.get(key);
    if (!current || at - current.start >= RATE_WINDOW_MS) {
      windows.set(key, { start: at, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}

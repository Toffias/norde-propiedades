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
  const counter = createMinuteCounter(now);
  return (key: string): boolean => counter.add(key) <= max;
}

/**
 * Cuenta los pedidos rechazados (firma inválida, body enorme) por IP, en la misma ventana de un
 * minuto. `blocked` no suma: solo dice si ese IP ya llegó al máximo. Así lo que llega bien firmado
 * no gasta el cupo de quien prueba sin el secreto.
 */
export function createRejectionLimiter(max: number, now: () => number) {
  const counter = createMinuteCounter(now);
  return {
    blocked: (key: string): boolean => counter.count(key) >= max,
    record: (key: string): void => {
      counter.add(key);
    },
  };
}

function createMinuteCounter(now: () => number) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  const open = (key: string, at: number) => {
    const window = windows.get(key);
    return window && at - window.start < RATE_WINDOW_MS ? window : undefined;
  };
  return {
    count: (key: string): number => open(key, now())?.count ?? 0,
    /** Suma uno y devuelve cuántos van en la ventana. */
    add: (key: string): number => {
      const at = now();
      if (windows.size > 10_000) {
        for (const [ip, window] of windows) {
          if (at - window.start >= RATE_WINDOW_MS) windows.delete(ip);
        }
      }
      const window = open(key, at);
      if (!window) {
        windows.set(key, { start: at, count: 1 });
        return 1;
      }
      window.count += 1;
      return window.count;
    },
  };
}

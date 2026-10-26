const WINDOW_MS = 10 * 60_000;

/**
 * Límite de envíos por clave (el IP) en ventanas fijas (10 minutos por defecto), en memoria: la
 * web corre en una sola instancia. Frena a quien manda un formulario o el chat en loop antes de
 * que llegue al backend.
 */
export function createRateLimiter(max: number, now: () => number, windowMs = WINDOW_MS) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) if (at - window.start >= windowMs) windows.delete(ip);
    }
    const current = windows.get(key);
    if (!current || at - current.start >= windowMs) {
      windows.set(key, { start: at, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}

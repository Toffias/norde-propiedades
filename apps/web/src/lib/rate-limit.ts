const WINDOW_MS = 10 * 60_000;

/**
 * Límite de envíos por clave (el IP) en ventanas de 10 minutos, en memoria: la web corre en una
 * sola instancia. Frena a quien manda un formulario o el chat en loop antes de que llegue al
 * backend.
 */
export function createRateLimiter(max: number, now: () => number) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) if (at - window.start >= WINDOW_MS) windows.delete(ip);
    }
    const current = windows.get(key);
    if (!current || at - current.start >= WINDOW_MS) {
      windows.set(key, { start: at, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}

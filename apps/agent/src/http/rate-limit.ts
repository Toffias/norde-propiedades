import type { AppInstance } from './types';

const WINDOW_MS = 60_000;
/** Con más IPs que esto en memoria, se descartan las ventanas vencidas. */
const PRUNE_ABOVE = 10_000;

/**
 * Rate limit propio del agente: ventana fija de un minuto por IP, en memoria (corre en una sola
 * instancia). Cubre todas las rutas, `/health` incluida. El IP es el que deja Nginx (`trustProxy`).
 * El chat del sitio llega siempre desde el servidor de apps/web, que ya limita a cada visitante: el
 * tope es holgado para no cortarlo.
 */
export function registerRateLimit(
  app: AppInstance,
  options: { readonly perMinute: number; readonly now?: () => number },
): void {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { readonly start: number; count: number }>();

  app.addHook('onRequest', async (request, reply) => {
    const at = now();
    if (windows.size > PRUNE_ABOVE) {
      for (const [ip, window] of windows) {
        if (at - window.start >= WINDOW_MS) windows.delete(ip);
      }
    }
    const current = windows.get(request.ip);
    if (!current || at - current.start >= WINDOW_MS) {
      windows.set(request.ip, { start: at, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > options.perMinute) {
      await reply.code(429).send({ error: 'too many requests' });
    }
  });
}

import type { AppInstance } from './types';

/** Parámetros de la URL que son secretos: el verify token de WhatsApp y cualquier `token`. */
const SECRET_PARAMS = /^(hub\.verify_token|.*token.*)$/i;

/** La URL con los parámetros secretos tapados, para el log. */
export function redactUrl(url: string): string {
  const query = url.indexOf('?');
  if (query < 0) return url;
  const params = new URLSearchParams(url.slice(query + 1));
  for (const key of [...params.keys()]) {
    if (SECRET_PARAMS.test(key)) params.set(key, '[redacted]');
  }
  return `${url.slice(0, query)}?${params.toString()}`;
}

/**
 * Una línea de log por pedido, con la URL redactada. Reemplaza el log de Fastify, que escribe la
 * URL tal cual: con el verify token de WhatsApp en la query.
 */
export function registerRequestLog(app: AppInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: redactUrl(request.url),
        statusCode: reply.statusCode,
        responseTime: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
    await Promise.resolve();
  });
}

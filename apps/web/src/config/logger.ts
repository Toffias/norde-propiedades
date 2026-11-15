import 'server-only';

import { pino, type Logger } from 'pino';

import { getLogLevel } from './env';

/** Hasta tres niveles de anidamiento: pino no tiene un comodín recursivo. */
function redactPaths(keys: readonly string[]): string[] {
  return keys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);
}

/** Datos personales que nunca se loguean en claro (Ley 25.326). */
const REDACT_PATHS = redactPaths(['phone', 'email', 'name', 'message', 'ip']);

let logger: Logger | undefined;

/** JSON a stdout. Se crea al primer uso. */
export function getLogger(): Logger {
  logger ??= pino({
    level: getLogLevel(),
    base: { service: 'norde-web' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  });
  return logger;
}

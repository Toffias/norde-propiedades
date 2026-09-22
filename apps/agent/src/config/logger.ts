import { pino, type Logger } from 'pino';

import type { Env } from './env';

/** Datos personales que nunca se loguean en claro (Ley 25.326). */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-hub-signature-256"]',
  '*.token',
  '*.phone',
  '*.email',
  '*.dni',
];

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  const pretty = env.NODE_ENV === 'development' && process.stdout.isTTY;

  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'norde-agent' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

import 'server-only';

import { z } from 'zod';

// Único archivo de la app que lee process.env. Se valida al primer uso (no en build).

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Firma las cookies de sesión. Generalo con `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL pública del panel, sin barra final (`https://gestion.norde.com.ar`). */
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }

  cached = parsed.data;
  return cached;
}

/** Solo el entorno de ejecución, sin exigir el resto de las variables (ej. rutas de desarrollo). */
export function getNodeEnv(): Env['NODE_ENV'] {
  return EnvSchema.shape.NODE_ENV.parse(process.env.NODE_ENV);
}

/** Para el logger: no exige el resto de las variables (un error de configuración también se loguea). */
export function getLogLevel(): Env['LOG_LEVEL'] {
  return EnvSchema.shape.LOG_LEVEL.catch('info').parse(process.env.LOG_LEVEL);
}

/** Runtime de Next.js donde corre el código (`instrumentation.ts` se carga en los dos). */
export function isNodeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs';
}

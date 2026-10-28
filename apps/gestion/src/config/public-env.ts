import { z } from 'zod';

// Variables públicas (`NEXT_PUBLIC_*`): las lee también el navegador, que no puede importar
// `env.ts` (server-only). Next las incrusta en el bundle durante el build, así que cada una se lee
// con su nombre literal y cambiarlas obliga a volver a compilar (ADR 0049). Nada secreto acá.

const PublicEnvSchema = z.object({
  /** DSN del proyecto en Sentry (no es secreto). Sin valor, no se reportan errores. */
  NEXT_PUBLIC_SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
  /** Entorno con que se etiquetan los errores en Sentry (`uat`, `production`). */
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1).default('development'),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const values: Record<string, string | undefined> = {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  };
  const source = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = PublicEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid public environment variables:\n${z.prettifyError(parsed.error)}`);
  }

  cached = parsed.data;
  return cached;
}

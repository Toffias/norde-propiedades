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

  /** Storage de archivos: `local` (disco, para desarrollo) o `s3` (Cloudflare R2 o AWS S3). */
  /** Sin valor, `local`; en producción es obligatorio elegirlo. */
  STORAGE_DRIVER: z.enum(['local', 's3']).optional(),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  /** R2: `https://<account>.r2.cloudflarestorage.com`. Sin valor, AWS S3. */
  S3_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Resend. Sin API key o remitente, el envío de emails avisa que falta configurarlo. */
  RESEND_API_KEY: z.string().optional(),
  /** Dirección de envío en un dominio verificado en Resend. */
  MAIL_FROM_ADDRESS: z.email().optional(),
});

/** Con `STORAGE_DRIVER=s3`, las credenciales y el bucket son obligatorios. */
const S3_REQUIRED = ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

const ValidatedEnvSchema = EnvSchema.superRefine((env, context) => {
  // Un deploy sin el driver guardaría los archivos en el disco del servidor sin que nadie lo note.
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['STORAGE_DRIVER'],
      message: 'Required in production (local or s3)',
    });
  }
  if (env.STORAGE_DRIVER !== 's3') return;
  for (const key of S3_REQUIRED) {
    if (env[key] === undefined) {
      context.addIssue({ code: 'custom', path: [key], message: 'Required with STORAGE_DRIVER=s3' });
    }
  }
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const source = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = ValidatedEnvSchema.safeParse(source);
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

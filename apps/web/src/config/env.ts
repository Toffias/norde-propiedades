import { z } from 'zod';

// Único archivo de la app que lee process.env.
// Sin `server-only`: también lo carga el CLI de Payload (fuera de Next.js).

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET debe tener al menos 32 caracteres'),
  NEXT_PUBLIC_SERVER_URL: z.url({ protocol: /^https?$/ }),

  /**
   * Storage de las fotos de las propiedades: el mismo bucket privado que apps/gestion, con
   * credenciales propias de solo lectura (ADR 0023). `local` lee la carpeta del panel en desarrollo.
   */
  STORAGE_DRIVER: z.enum(['local', 's3']).optional(),
  STORAGE_LOCAL_DIR: z.string().default('../gestion/.storage'),
  S3_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Secreto que comparte con apps/gestion (`WEB_REVALIDATE_SECRET`) para firmar los avisos de
   * cambios (HMAC-SHA256 del body). Sin él, `POST /api/revalidate` no se expone.
   */
  REVALIDATE_SECRET: z.string().min(32).optional(),
});

/** Con `STORAGE_DRIVER=s3`, las credenciales y el bucket son obligatorios. */
const S3_REQUIRED = ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

const ValidatedEnvSchema = EnvSchema.superRefine((env, context) => {
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

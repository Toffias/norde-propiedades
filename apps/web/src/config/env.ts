import { z } from 'zod';

// Único archivo de la app que lee process.env.
// Sin `server-only`: también lo carga el CLI de Payload (fuera de Next.js).

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Firma las sesiones del admin de Payload y la cookie del chat. En producción, ver `isWeakSecret`. */
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET debe tener al menos 32 caracteres'),
  NEXT_PUBLIC_SERVER_URL: z.url({ protocol: /^https?$/ }),
  /**
   * Si los buscadores pueden indexar el sitio (`robots.txt`). Solo `true` en el sitio de producción:
   * sin valor, UAT, previews y desarrollo piden no indexar nada.
   */
  ALLOW_INDEXING: z.stringbool().default(false),

  /** Errores del servidor a Sentry (ADR 0055). Sin DSN, apagado. */
  SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).default('development'),

  /**
   * Storage de las fotos de las propiedades: el mismo bucket privado que apps/gestion, con
   * credenciales propias de solo lectura (ADR 0023). `local` lee la carpeta del panel en desarrollo.
   */
  STORAGE_DRIVER: z.enum(['local', 's3']).optional(),
  STORAGE_LOCAL_DIR: z.string().default('../gestion/.storage'),
  S3_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  /** Carpeta del bucket, para compartirlo con otros proyectos (`norde-uat`). Sin valor, la raíz. */
  S3_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/, 'A folder like norde-uat')
    .optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Secreto que comparte con apps/gestion (`WEB_REVALIDATE_SECRET`) para firmar los avisos de
   * cambios (HMAC-SHA256 del body). Sin él, `POST /api/revalidate` no se expone.
   */
  REVALIDATE_SECRET: z.string().min(32).optional(),

  /**
   * Consultas del formulario de la ficha (ADR 0021): `https://<panel>/api/webhooks/inquiries/web`
   * y el secreto que comparte con `INQUIRY_WEBHOOK_SECRET` de apps/gestion. Las dos o ninguna; sin
   * ellas, la ficha ofrece solo WhatsApp.
   */
  INQUIRY_WEBHOOK_URL: z.url({ protocol: /^https?$/ }).optional(),
  INQUIRY_WEBHOOK_SECRET: z.string().min(32).optional(),
  /**
   * Suscripciones a búsquedas del listado (#208): `https://<panel>/api/webhooks/subscriptions/web`.
   * Firma con `INQUIRY_WEBHOOK_SECRET`, que la exige. Sin ella, el listado no ofrece suscribirse.
   */
  SUBSCRIPTION_WEBHOOK_URL: z.url({ protocol: /^https?$/ }).optional(),

  /**
   * Chat con el agente de IA (ADR 0037): `http://127.0.0.1:3100/chat/messages` de apps/agent y el
   * secreto que comparte con su `WEB_CHAT_SECRET`. Las dos o ninguna; sin ellas, no hay burbuja.
   */
  AGENT_CHAT_URL: z.url({ protocol: /^https?$/ }).optional(),
  AGENT_CHAT_SECRET: z.string().min(32).optional(),
  /**
   * Horas sin mensajes tras las que el agente olvida la charla: el mismo valor que su
   * `CONVERSATION_IDLE_RESET_HOURS`. Pasado ese tiempo, el chat ofrece empezar una nueva.
   */
  CHAT_IDLE_RESET_HOURS: z.coerce.number().int().positive().default(24),

  /**
   * `true` solo para crear el primer editor desde `/admin` con la base vacía. Sin ella, el alta del
   * primer usuario queda cerrada: el primero que llegara a un sitio recién instalado sería admin.
   */
  PAYLOAD_FIRST_REGISTER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** Valores de ejemplo que circularon en `.env.example` o en docs: nunca sirven de secreto. */
const EXAMPLE_SECRETS = new Set(['cambiar-por-un-secreto-largo-y-aleatorio']);

/** Mínimo de caracteres distintos: descarta `aaaa…` o `12341234…`. */
const MIN_DISTINCT_CHARS = 10;

/**
 * Un secreto que cualquiera puede adivinar: el de ejemplo, un placeholder (`changeme`, `cambiar…`,
 * `secret…`) o uno con muy pocos caracteres distintos.
 */
export function isWeakSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  return (
    EXAMPLE_SECRETS.has(normalized) ||
    /^(cambiar|change|changeme|secret|secreto|example|ejemplo|placeholder|xxx)/.test(normalized) ||
    new Set(normalized).size < MIN_DISTINCT_CHARS
  );
}

/** Con `STORAGE_DRIVER=s3`, las credenciales y el bucket son obligatorios. */
const S3_REQUIRED = ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

const ValidatedEnvSchema = EnvSchema.superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && isWeakSecret(env.PAYLOAD_SECRET)) {
    context.addIssue({
      code: 'custom',
      path: ['PAYLOAD_SECRET'],
      message:
        'PAYLOAD_SECRET es el de ejemplo o es débil: generá uno con `openssl rand -base64 48`',
    });
  }
  if ((env.INQUIRY_WEBHOOK_URL === undefined) !== (env.INQUIRY_WEBHOOK_SECRET === undefined)) {
    const missing = env.INQUIRY_WEBHOOK_URL ? 'INQUIRY_WEBHOOK_SECRET' : 'INQUIRY_WEBHOOK_URL';
    context.addIssue({
      code: 'custom',
      path: [missing],
      message: 'Set both INQUIRY_WEBHOOK_* or none',
    });
  }
  if (env.SUBSCRIPTION_WEBHOOK_URL !== undefined && env.INQUIRY_WEBHOOK_SECRET === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['INQUIRY_WEBHOOK_SECRET'],
      message: 'Required with SUBSCRIPTION_WEBHOOK_URL',
    });
  }
  if ((env.AGENT_CHAT_URL === undefined) !== (env.AGENT_CHAT_SECRET === undefined)) {
    const missing = env.AGENT_CHAT_URL ? 'AGENT_CHAT_SECRET' : 'AGENT_CHAT_URL';
    context.addIssue({ code: 'custom', path: [missing], message: 'Set both AGENT_CHAT_* or none' });
  }
  // `next build` también corre en producción, pero no sirve fotos (y el CI no tiene storage).
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  if (env.NODE_ENV === 'production' && !building && env.STORAGE_DRIVER === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['STORAGE_DRIVER'],
      message: 'Required in production (s3, or local for a single server)',
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

/** Valida un entorno (las variables vacías cuentan como ausentes). Exportada para los tests. */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = ValidatedEnvSchema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** El nivel del logger, sin validar el resto: el logger se usa también cuando el entorno falla. */
export function getLogLevel(): Env['LOG_LEVEL'] {
  return EnvSchema.shape.LOG_LEVEL.catch('info').parse(process.env.LOG_LEVEL);
}

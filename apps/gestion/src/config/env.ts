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

  /**
   * Geocodificación con Nominatim (OpenStreetMap): la app y un contacto, como pide su política de
   * uso (`NordePropiedades/1.0 (sistemas@norde.com.ar)`).
   */
  GEOCODER_USER_AGENT: z.string().min(3).default('NordePropiedades/1.0 (panel de gestion)'),
  /** Otra instancia de Nominatim. Sin valor, la pública de OpenStreetMap. */
  GEOCODER_URL: z.url({ protocol: /^https?$/ }).optional(),

  /**
   * Relay del outbox y workers de pg-boss (ADR 0021): variantes de fotos, PDF, importaciones,
   * reglas de oportunidades, supresión y unificación. Con `false`, los eventos esperan en el outbox.
   */
  JOBS_ENABLED: z.stringbool().default(true),
  /** Avisos al equipo cuando entra una oportunidad (Slack, Teams, n8n…). Sin URL, van al log. */
  TEAM_WEBHOOK_URL: z.url().optional(),
  TEAM_WEBHOOK_TOKEN: z.string().min(1).optional(),

  /**
   * Secreto compartido con apps/web para firmar cada consulta (HMAC-SHA256 del body crudo). Sin
   * secreto, el webhook de consultas de la web no se expone.
   */
  INQUIRY_WEBHOOK_SECRET: z.string().min(32).optional(),
  /** Pedidos por minuto por IP al webhook de consultas. */
  INQUIRY_WEBHOOK_RATE_PER_MINUTE: z.coerce.number().int().positive().default(60),
  /** Reglas de asignación de consultas (#48): en pausa hasta que Norde las use. */
  INQUIRY_RULES_ENABLED: z.stringbool().default(false),
  /** Funciones de Tokko que Norde no usa hoy (#50): construidas, pero ocultas hasta que las pidan. */
  WATERMARK_ENABLED: z.stringbool().default(false),
  REFERENCE_CODES_ENABLED: z.stringbool().default(false),
  TEAMS_ENABLED: z.stringbool().default(false),
  CUSTOM_ATTRIBUTES_ENABLED: z.stringbool().default(false),
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

/** Si se muestran las reglas de asignación de consultas (#48). */
export function inquiryRulesEnabled(): boolean {
  return getEnv().INQUIRY_RULES_ENABLED;
}

/** Funciones de "Mi empresa" que se prenden por entorno (#50). */
export interface CompanyFeatures {
  readonly watermark: boolean;
  readonly referenceCodes: boolean;
  readonly teams: boolean;
  readonly customAttributes: boolean;
}

export function companyFeatures(): CompanyFeatures {
  const env = getEnv();
  return {
    watermark: env.WATERMARK_ENABLED,
    referenceCodes: env.REFERENCE_CODES_ENABLED,
    teams: env.TEAMS_ENABLED,
    customAttributes: env.CUSTOM_ATTRIBUTES_ENABLED,
  };
}

/** Runtime de Next.js donde corre el código (`instrumentation.ts` se carga en los dos). */
export function isNodeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'nodejs';
}

/** `next build` también carga `instrumentation.ts`: ahí no hay base ni procesos que arrancar. */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

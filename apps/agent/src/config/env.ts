import { existsSync } from 'node:fs';

import { z } from 'zod';

// Único archivo de la app que lee process.env.

const WHATSAPP_REQUIRED = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
] as const;

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    /** Sitio público: arma los links a las fichas que manda el agente. */
    PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),

    // Agente de IA
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default('gpt-5-mini'),
    AGENT_MAX_MEMORY_ITEMS: positiveInt(60),
    /** Fallos seguidos del agente antes de dejar de mandar respuestas de error (que se cobran). */
    AGENT_BREAKER_THRESHOLD: positiveInt(5),
    AGENT_BREAKER_COOLDOWN_MINUTES: positiveInt(10),

    // Conversaciones
    CONVERSATION_IDLE_RESET_HOURS: positiveInt(24),
    MAX_INBOUND_TEXT_CHARS: positiveInt(1000),
    /** Mensajes más viejos que esto (reentregas tardías de Meta) no se responden. */
    MAX_INBOUND_AGE_HOURS: positiveInt(12),

    // WhatsApp Cloud API. El canal se habilita si están las cuatro obligatorias.
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    WHATSAPP_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default('v23.0'),
    /** Solo para pruebas locales contra un mock de la Graph API. */
    WHATSAPP_API_BASE_URL: z.url().default('https://graph.facebook.com'),
    /** Solo para el número de prueba de Meta (quita el 9 de los celulares argentinos). */
    WHATSAPP_STRIP_AR_NINE: z.stringbool().default(false),
    /** Silencio que se espera para juntar mensajes seguidos en un solo turno. */
    WHATSAPP_DEBOUNCE_MS: z.coerce.number().int().min(0).default(4000),
    LIMIT_CONTACT_MESSAGES_PER_HOUR: positiveInt(30),
    LIMIT_CONTACT_MESSAGES_PER_DAY: positiveInt(120),
    /** Tope de mensajes enviados en 24 h. A ~0,026 USD c/u, 3000 ≈ 78 USD por día. */
    LIMIT_WHATSAPP_OUTBOUND_PER_DAY: positiveInt(3000),

    // Avisos al equipo (Slack, Teams, n8n…). Sin URL, se registran en el log.
    TEAM_WEBHOOK_URL: z.url().optional(),
    TEAM_WEBHOOK_TOKEN: z.string().min(1).optional(),

    /** Relay del outbox y workers de pg-boss. */
    JOBS_ENABLED: z.stringbool().default(true),

    // Storage de archivos: los jobs generan las variantes de las fotos y los PDF de la ficha.
    /** `local` (disco, para desarrollo) o `s3` (Cloudflare R2 o AWS S3), como el panel. */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    /** En desarrollo, la misma carpeta que usa el panel. */
    STORAGE_LOCAL_DIR: z.string().default('../gestion/.storage'),
    /** R2: `https://<account>.r2.cloudflarestorage.com`. Sin valor, AWS S3. */
    S3_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required with STORAGE_DRIVER=s3' });
        }
      }
    }
    const present = WHATSAPP_REQUIRED.filter((key) => env[key] !== undefined);
    if (present.length > 0 && present.length < WHATSAPP_REQUIRED.length) {
      for (const key of WHATSAPP_REQUIRED.filter((k) => env[k] === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Para habilitar WhatsApp hacen falta las cuatro variables WHATSAPP_*',
        });
      }
    }
    if (present.length === WHATSAPP_REQUIRED.length && env.OPENAI_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'El canal WhatsApp necesita el agente de IA',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export interface WhatsAppConfig {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly verifyToken: string;
  readonly appSecret: string;
}

/** Credenciales del canal WhatsApp, o `undefined` si el canal no está configurado. */
export function whatsAppConfig(env: Env): WhatsAppConfig | undefined {
  const {
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_VERIFY_TOKEN: verifyToken,
    WHATSAPP_APP_SECRET: appSecret,
  } = env;
  return accessToken && phoneNumberId && verifyToken && appSecret
    ? { accessToken, phoneNumberId, verifyToken, appSecret }
    : undefined;
}

/**
 * Una variable vacía (`KEY=`) cuenta como no definida, así aplican los defaults.
 * Lección del MVP APZ-WP-BOT: sin esto, un .env recién copiado no arrancaba.
 */
export function withoutBlanks(source: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const parsed = EnvSchema.safeParse(withoutBlanks(source));
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadEnv(): Env {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return parseEnv(process.env);
}

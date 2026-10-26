import { canSignIn, USER_STATUSES } from '@norde/core/identity';
import { Actor, auditAction, type AuditLog, type IdGenerator } from '@norde/core/shared';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { accounts, sessions, twoFactors, users, verifications } from '../db/schema';
import type { InfraLogger } from '../shared/logger';

// Autenticación del panel con Better Auth: email y contraseña, sesiones en la base (tablas de
// `identity`). El alta pública está deshabilitada: los usuarios los crea un administrador (#3) o
// el script de setup. Los ingresos, ingresos fallidos y salidas se auditan acá porque no pasan
// por un caso de uso (CLAUDE.md, "Auditoría e historial de cambios").
//
// Verificación en dos pasos (#113): plugin `twoFactor`, opcional para cada usuario, con app
// autenticadora (TOTP) y códigos de respaldo. Con el segundo factor activo, la contraseña correcta
// no da sesión: devuelve `twoFactorRedirect` y la sesión se crea al verificar el código. Activarla,
// desactivarla, regenerar los códigos y cada código (bien o mal) al ingresar también se auditan.

export interface AuthOptions {
  readonly db: DbExecutor;
  /** Secreto para firmar las cookies (32 caracteres o más). */
  readonly secret: string;
  /** URL pública del panel (`https://gestion.norde.com.ar`). */
  readonly baseUrl: string;
  readonly ids: IdGenerator;
  readonly audit: AuditLog;
  readonly logger: InfraLogger;
  /** Plugins del framework, por ejemplo `nextCookies()` para las Server Actions de Next.js. */
  readonly plugins?: readonly BetterAuthPlugin[];
  /** En producción siempre; en desarrollo se puede apagar para no frenar las pruebas. */
  readonly rateLimit: boolean;
}

const SIGN_IN_PATH = '/sign-in/email';
const SIGN_OUT_PATH = '/sign-out';
const DISABLE_TWO_FACTOR_PATH = '/two-factor/disable';
const BACKUP_CODES_PATH = '/two-factor/generate-backup-codes';
/** Cookie firmada del plugin con el desafío pendiente entre la contraseña y el código. */
const TWO_FACTOR_COOKIE = 'two_factor';
/** Nombre con el que aparece la cuenta en la app autenticadora. */
const TWO_FACTOR_ISSUER = 'Norde Gestión';
const AUTH_ACTOR = Actor.system('auth', []);
const Status = z.enum(USER_STATUSES);
const SignInBody = z.object({ email: z.string() });
const SessionUser = z.object({ user: z.object({ id: z.string() }) });

/** Con qué se verificó el segundo factor, tal como queda en la auditoría. */
type SecondFactor = 'totp' | 'backup-code';

const SECOND_FACTOR_BY_PATH: Readonly<Partial<Record<string, SecondFactor>>> = {
  '/two-factor/verify-totp': 'totp',
  '/two-factor/verify-backup-code': 'backup-code',
};

/**
 * A quién corresponde la verificación de un código. Se resuelve antes de que el plugin consuma el
 * desafío: al ingresar (`signingIn`) sale de la cookie del desafío; al activar la verificación en
 * dos pasos, de la sesión abierta.
 */
interface PendingVerification {
  readonly userId: string;
  readonly signingIn: boolean;
  /** Ya tenía la verificación activa antes de este código (al activarla, todavía no). */
  readonly wasEnabled: boolean;
}

function userTarget(action: string, userId: string) {
  return { action, entityType: 'user', entityId: userId, clientIds: [] };
}

function errorCode(returned: unknown): string | undefined {
  return isAPIError(returned) ? (returned.body?.code ?? 'UNKNOWN') : undefined;
}

export function createAuth(options: AuthOptions) {
  const { db, audit, logger } = options;

  async function findUserByEmail(email: string) {
    const [user] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return user;
  }

  async function findStatus(userId: string) {
    const [user] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user && Status.parse(user.status);
  }

  async function isTwoFactorEnabled(userId: string) {
    const [user] = await db
      .select({ enabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.enabled === true;
  }

  // Del `before` al `after` de un mismo request: Better Auth pasa el mismo objeto `context`.
  const pendingVerifications = new WeakMap<object, PendingVerification>();

  // Va después de `twoFactor`: los hooks `after` corren en el orden de los plugins (y los de
  // `options.hooks` antes que todos), y recién después del suyo se sabe si la contraseña correcta
  // dio sesión o quedó esperando el código.
  const auditPlugin = {
    id: 'norde-auth-audit',
    hooks: {
      before: [
        {
          matcher: (ctx) => SECOND_FACTOR_BY_PATH[ctx.path ?? ''] !== undefined,
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);
            if (current) {
              pendingVerifications.set(ctx.context, {
                userId: current.user.id,
                signingIn: false,
                wasEnabled: await isTwoFactorEnabled(current.user.id),
              });
              return;
            }
            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
            const challengeId = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
            if (typeof challengeId !== 'string') return;
            const challenge = await ctx.context.internalAdapter.findVerificationValue(challengeId);
            if (!challenge) return;
            pendingVerifications.set(ctx.context, {
              userId: challenge.value,
              signingIn: true,
              wasEnabled: true,
            });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const returned: unknown = ctx.context.returned;

            if (!isAPIError(returned)) {
              // Sin sesión nueva falta el segundo factor: el ingreso se audita con el código.
              const userId = ctx.context.newSession?.user.id;
              if (userId === undefined) return;
              await audit.record(
                auditAction(Actor.user(userId, []), userTarget('user.signed-in', userId)),
              );
              return;
            }

            // Ingreso fallido: se registra contra el usuario si el email existe. El email nunca se
            // guarda ni se loguea (puede ser de otra persona, o un error de tipeo con datos reales).
            const body = SignInBody.safeParse(ctx.body);
            const user = body.success ? await findUserByEmail(body.data.email) : undefined;
            if (!user) {
              logger.warn({ code: returned.body?.code }, 'Sign-in failed for an unknown email');
              return;
            }
            await audit.record(
              auditAction(AUTH_ACTOR, userTarget('user.sign-in-failed', user.id), {
                reason: { before: null, after: returned.body?.code ?? 'UNKNOWN' },
              }),
            );
          }),
        },
        {
          matcher: (ctx) => SECOND_FACTOR_BY_PATH[ctx.path ?? ''] !== undefined,
          handler: createAuthMiddleware(async (ctx) => {
            const factor = SECOND_FACTOR_BY_PATH[ctx.path];
            if (factor === undefined) return;
            const failure = errorCode(ctx.context.returned);
            const pending = pendingVerifications.get(ctx.context);
            if (!pending) {
              // Desafío vencido o cookie inválida: no hay a quién atribuirlo.
              logger.warn({ code: failure }, 'Two-factor verification without a known user');
              return;
            }

            if (pending.signingIn) {
              await audit.record(
                failure === undefined
                  ? auditAction(
                      Actor.user(pending.userId, []),
                      userTarget('user.signed-in', pending.userId),
                      { secondFactor: { before: null, after: factor } },
                    )
                  : auditAction(AUTH_ACTOR, userTarget('user.sign-in-failed', pending.userId), {
                      reason: { before: null, after: failure },
                      secondFactor: { before: null, after: factor },
                    }),
              );
              return;
            }
            // Con la sesión abierta, el primer código correcto de la app activa la verificación.
            if (failure === undefined && !pending.wasEnabled) {
              await audit.record(
                auditAction(
                  Actor.user(pending.userId, []),
                  userTarget('user.two-factor-enabled', pending.userId),
                ),
              );
            }
          }),
        },
        {
          matcher: (ctx) => ctx.path === DISABLE_TWO_FACTOR_PATH || ctx.path === BACKUP_CODES_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            if (errorCode(ctx.context.returned) !== undefined) return;
            const current = SessionUser.safeParse(ctx.context.session);
            if (!current.success) return;
            const userId = current.data.user.id;
            const action =
              ctx.path === DISABLE_TWO_FACTOR_PATH
                ? 'user.two-factor-disabled'
                : 'user.two-factor-backup-codes-regenerated';
            await audit.record(auditAction(Actor.user(userId, []), userTarget(action, userId)));
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications, twoFactors },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    // Better Auth no da de alta usuarios (lo hace `CreateUser`), pero valida que conoce toda
    // columna obligatoria de `users`.
    user: { additionalFields: { branchId: { type: 'string', required: true, input: false } } },
    advanced: { database: { generateId: () => options.ids.next() } },
    // En memoria: alcanza con un solo proceso del panel. Con varios, pasar a `database`.
    rateLimit: {
      enabled: options.rateLimit,
      customRules: { [SIGN_IN_PATH]: { window: 60, max: 5 } },
    },
    databaseHooks: {
      session: {
        create: {
          // Un usuario suspendido no obtiene sesión aunque la contraseña sea correcta.
          before: async (session) => {
            const status = await findStatus(session.userId);
            return status !== undefined && canSignIn(status);
          },
          // Último ingreso, para el listado de usuarios. No es un cambio de datos: no se audita
          // como edición (el ingreso ya queda como `user.signed-in`).
          after: async (session) => {
            await db
              .update(users)
              .set({ lastLoginAt: session.createdAt })
              .where(eq(users.id, session.userId));
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_OUT_PATH) return;
        // Después de salir ya no hay sesión: se lee antes.
        const current = await getSessionFromCtx(ctx);
        if (!current) return;
        const actor = Actor.user(current.user.id, []);
        await audit.record(auditAction(actor, userTarget('user.signed-out', current.user.id)));
      }),
    },
    plugins: [
      twoFactor({ issuer: TWO_FACTOR_ISSUER }),
      auditPlugin,
      // `nextCookies` y otros del framework van últimos.
      ...(options.plugins ?? []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Lee la sesión de un request: solo el ID del usuario, el resto lo arma el core. */
export class BetterAuthSessionReader {
  constructor(private readonly auth: Auth) {}

  async currentUserId(headers: Headers): Promise<string | undefined> {
    const session = await this.auth.api.getSession({ headers });
    return session?.user.id;
  }

  async currentSessionId(headers: Headers): Promise<string | undefined> {
    const session = await this.auth.api.getSession({ headers });
    return session?.session.id;
  }
}

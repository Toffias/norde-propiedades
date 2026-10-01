import { canSignIn, USER_STATUSES } from '@norde/core/identity';
import { Actor, auditAction, type AuditLog, type IdGenerator } from '@norde/core/shared';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { accounts, sessions, users, verifications } from '../db/schema';
import type { InfraLogger } from '../shared/logger';

// Autenticación del panel con Better Auth: email y contraseña, sesiones en la base (tablas de
// `identity`). El alta pública está deshabilitada: los usuarios los crea un administrador (#3) o
// el script de setup. Los ingresos, ingresos fallidos y salidas se auditan acá porque no pasan
// por un caso de uso (CLAUDE.md, "Auditoría e historial de cambios").

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
const AUTH_ACTOR = Actor.system('auth', []);
const Status = z.enum(USER_STATUSES);
const SignInBody = z.object({ email: z.string() });

function userTarget(action: string, userId: string) {
  return { action, entityType: 'user', entityId: userId, clientIds: [] };
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

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
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
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_PATH) return;
        const returned: unknown = ctx.context.returned;

        if (!isAPIError(returned)) {
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
    plugins: [...(options.plugins ?? [])],
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
}

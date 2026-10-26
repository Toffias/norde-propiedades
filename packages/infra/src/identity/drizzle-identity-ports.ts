import type { CredentialStore, UserSessions } from '@norde/core/identity';
import type { Clock, IdGenerator } from '@norde/core/shared';
import { and, eq, ne } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { accounts, sessions, twoFactors, users } from '../db/schema';

/** Better Auth guarda la contraseña en la cuenta `credential` cuyo `account_id` es el usuario. */
const CREDENTIAL_PROVIDER = 'credential';

export class DrizzleCredentialStore implements CredentialStore {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async findPasswordHash(userId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.providerId, CREDENTIAL_PROVIDER), eq(accounts.accountId, userId)))
      .limit(1);
    return row?.password ?? undefined;
  }

  async setPasswordHash(userId: string, hash: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .insert(accounts)
      .values({
        id: this.ids.next(),
        userId,
        accountId: userId,
        providerId: CREDENTIAL_PROVIDER,
        password: hash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [accounts.providerId, accounts.accountId],
        set: { password: hash, updatedAt: now },
      });
  }

  async hasTwoFactor(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ enabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.enabled === true;
  }

  async removeTwoFactor(userId: string): Promise<void> {
    // Mismas tablas que el plugin `twoFactor` de Better Auth (`/two-factor/disable`).
    await this.db.delete(twoFactors).where(eq(twoFactors.userId, userId));
    await this.db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, userId));
  }
}

/** Las sesiones de Better Auth viven en la base: borrarlas las cierra en el próximo request. */
export class DrizzleUserSessions implements UserSessions {
  constructor(private readonly db: DbExecutor) {}

  async revokeAll(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async revokeOthers(userId: string, keepSessionId: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
  }
}

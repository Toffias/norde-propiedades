import type { CredentialStore, UserSessions } from '@norde/core/identity';
import type { Clock, IdGenerator } from '@norde/core/shared';
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { accounts, sessions } from '../db/schema';

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
}

/** Las sesiones de Better Auth viven en la base: borrarlas las cierra en el próximo request. */
export class DrizzleUserSessions implements UserSessions {
  constructor(private readonly db: DbExecutor) {}

  async revokeAll(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }
}

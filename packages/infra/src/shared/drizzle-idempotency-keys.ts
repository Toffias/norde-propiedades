import type {
  Clock,
  IdempotencyClaim,
  IdempotencyKeys,
  IdempotencyScope,
} from '@norde/core/shared';
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { idempotencyKeys } from '../db/schema';

/**
 * Claves de idempotencia (ADR 0050). `claim` inserta la clave sin resultado: si otra transacción
 * con la misma clave está en curso, Postgres espera a que termine. Si esa terminó bien, el insert no
 * hace nada y se devuelve su resultado; si hizo rollback, la clave queda para esta.
 */
export class DrizzleIdempotencyKeys implements IdempotencyKeys {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async claim(scope: IdempotencyScope): Promise<IdempotencyClaim> {
    const inserted = await this.db
      .insert(idempotencyKeys)
      .values({
        actorId: scope.actorId,
        command: scope.command,
        key: scope.key,
        result: null,
        createdAt: this.clock.now(),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });
    if (inserted.length > 0) return { claimed: true };

    const [stored] = await this.db
      .select({ result: idempotencyKeys.result })
      .from(idempotencyKeys)
      .where(this.#matches(scope))
      .limit(1);
    if (stored?.result === undefined || stored.result === null) {
      throw new Error(`Idempotency key for ${scope.command} has no stored result`);
    }
    return { claimed: false, result: fromJsonb(stored.result) };
  }

  async complete(scope: IdempotencyScope, result: unknown): Promise<void> {
    await this.db
      .update(idempotencyKeys)
      .set({ result: toJsonb(result) })
      .where(this.#matches(scope));
  }

  #matches(scope: IdempotencyScope) {
    return and(
      eq(idempotencyKeys.actorId, scope.actorId),
      eq(idempotencyKeys.command, scope.command),
      eq(idempotencyKeys.key, scope.key),
    );
  }
}

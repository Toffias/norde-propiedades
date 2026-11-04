import type { DefaultAssignee } from '@norde/core/clients';
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { users } from '../db/schema';

/**
 * El asesor por defecto (#208) para clients: el usuario activo marcado como tal. Usa
 * `users_default_assignee_uq` (hay como mucho uno).
 */
export class DrizzleDefaultAssignee implements DefaultAssignee {
  constructor(private readonly db: DbExecutor) {}

  async find() {
    const [row] = await this.db
      .select({ userId: users.id, branchId: users.branchId })
      .from(users)
      .where(and(eq(users.defaultAssignee, true), eq(users.status, 'active')))
      .limit(1);
    return row;
  }
}

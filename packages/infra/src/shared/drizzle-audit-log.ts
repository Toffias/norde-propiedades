import type { AuditEntry, AuditLog, Clock, IdGenerator } from '@norde/core/shared';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { auditLog } from '../db/schema';

export class DrizzleAuditLog implements AuditLog {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      id: this.ids.next(),
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: entry.changes === undefined ? null : toJsonb(entry.changes),
      occurredAt: this.clock.now(),
    });
  }
}

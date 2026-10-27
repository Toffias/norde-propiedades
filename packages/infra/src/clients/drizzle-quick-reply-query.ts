import type { QuickReplyCriteria, QuickReplyQuery, QuickReplySnapshot } from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { quickReplies } from '../db/schema';

import { toQuickReplySnapshot } from './drizzle-quick-reply-repository';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Las respuestas rápidas activas o las inactivas, por nombre (`quick_replies_active_name_idx`). La
 * búsqueda es "contiene", sin acentos ni mayúsculas (`quick_replies_name_trgm_idx`).
 */
export class DrizzleQuickReplyQuery implements QuickReplyQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: QuickReplyCriteria): Promise<PageSlice<QuickReplySnapshot>> {
    const conditions: SQL[] = [eq(quickReplies.isActive, criteria.active)];
    if (criteria.text !== undefined) {
      conditions.push(
        sql`core.search_normalize(${quickReplies.name}) like '%' || core.search_normalize(${escapeLike(criteria.text)}) || '%'`,
      );
    }
    const where = and(...conditions);
    const by = criteria.direction === 'asc' ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(quickReplies)
        .where(where)
        .orderBy(by(quickReplies.name), by(quickReplies.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(quickReplies).where(where),
    ]);
    return { items: rows.map(toQuickReplySnapshot), total: totals[0]?.total ?? 0 };
  }
}

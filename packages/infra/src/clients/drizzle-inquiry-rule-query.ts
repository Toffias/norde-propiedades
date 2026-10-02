import type { InquiryRuleCriteria, InquiryRuleItem, InquiryRuleQuery } from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { asc, count, eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { inquiryAssignmentRules } from '../db/schema';

import { agentsByRule, toRuleSnapshot } from './drizzle-inquiry-rule-repository';

/**
 * Las reglas de una pestaña por prioridad, con `inquiry_assignment_rules_active_position_idx`. La
 * prioridad es el lugar en esa pestaña: la posición guardada puede tener huecos (reglas borradas o
 * de la otra pestaña).
 */
export class DrizzleInquiryRuleQuery implements InquiryRuleQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: InquiryRuleCriteria): Promise<PageSlice<InquiryRuleItem>> {
    const where = eq(inquiryAssignmentRules.isActive, criteria.active);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(inquiryAssignmentRules)
        .where(where)
        .orderBy(asc(inquiryAssignmentRules.position), asc(inquiryAssignmentRules.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(inquiryAssignmentRules).where(where),
    ]);
    const agents = await agentsByRule(
      this.db,
      rows.map((r) => r.id),
    );
    return {
      items: rows.map((row, index) => ({
        rule: toRuleSnapshot(row, agents.get(row.id) ?? []),
        priority: criteria.offset + index + 1,
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}

import {
  CONTACT_CHANNELS,
  InquiryAssignmentRule,
  MAX_INQUIRY_RULES,
  type InquiryRuleConditions,
  type InquiryRuleId,
  type InquiryRuleRepository,
  type InquiryRuleSnapshot,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { inquiryAssignmentRuleAgents, inquiryAssignmentRules } from '../db/schema';

// Las condiciones se guardan como jsonb: se validan al leer (una fila que no valida está corrupta).
// Una lista que falta es "cualquiera", como en el dominio.
const list = <T extends z.ZodType>(item: T) => z.array(item).default([]);
const ConditionsSchema = z.object({
  channels: list(z.enum(CONTACT_CHANNELS)),
  operations: list(z.string()),
  propertyTypes: list(z.string()),
  neighborhoods: list(z.string()),
  propertyIds: list(z.string()),
  developmentIds: list(z.string()),
});

type RuleRow = typeof inquiryAssignmentRules.$inferSelect;
type AgentRow = typeof inquiryAssignmentRuleAgents.$inferSelect;

export function toRuleSnapshot(row: RuleRow, agents: readonly AgentRow[]): InquiryRuleSnapshot {
  const id = parseId<'InquiryAssignmentRule'>(row.id);
  if (id.isErr()) throw new Error(`Invalid inquiry rule id ${row.id}`);
  const conditions: InquiryRuleConditions = ConditionsSchema.parse(row.conditions);
  return {
    id: id.value,
    name: row.name,
    isActive: row.isActive,
    position: row.position,
    conditions,
    agents: [...agents]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ userId: a.userId, weight: a.weight })),
    cursor: row.cursor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Los agentes de estas reglas, agrupados por regla. */
export async function agentsByRule(
  db: DbExecutor,
  ruleIds: readonly string[],
): Promise<Map<string, AgentRow[]>> {
  const byRule = new Map<string, AgentRow[]>();
  if (ruleIds.length === 0) return byRule;
  const rows = await db
    .select()
    .from(inquiryAssignmentRuleAgents)
    .where(inArray(inquiryAssignmentRuleAgents.ruleId, [...ruleIds]))
    .orderBy(asc(inquiryAssignmentRuleAgents.ruleId), asc(inquiryAssignmentRuleAgents.position));
  for (const row of rows) byRule.set(row.ruleId, [...(byRule.get(row.ruleId) ?? []), row]);
  return byRule;
}

/** Las reglas de asignación de consultas y sus agentes (`inquiry_assignment_rules`). */
export class DrizzleInquiryRuleRepository implements InquiryRuleRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: InquiryRuleId): Promise<InquiryAssignmentRule | undefined> {
    const [row] = await this.db
      .select()
      .from(inquiryAssignmentRules)
      .where(eq(inquiryAssignmentRules.id, id))
      .limit(1);
    return row && this.restore(row);
  }

  async findForUpdate(id: InquiryRuleId): Promise<InquiryAssignmentRule | undefined> {
    const [row] = await this.db
      .select()
      .from(inquiryAssignmentRules)
      .where(eq(inquiryAssignmentRules.id, id))
      .limit(1)
      .for('update');
    return row && this.restore(row);
  }

  async findAll(): Promise<InquiryAssignmentRule[]> {
    const rows = await this.db
      .select()
      .from(inquiryAssignmentRules)
      .orderBy(asc(inquiryAssignmentRules.position), asc(inquiryAssignmentRules.id))
      .limit(MAX_INQUIRY_RULES);
    const agents = await agentsByRule(
      this.db,
      rows.map((r) => r.id),
    );
    return rows.map((row) =>
      InquiryAssignmentRule.restore(toRuleSnapshot(row, agents.get(row.id) ?? [])),
    );
  }

  /** Reemplaza los agentes enteros: son pocos y el orden importa. */
  async save(rule: InquiryAssignmentRule, actorId: string): Promise<void> {
    const s = rule.toSnapshot();
    const values = {
      name: s.name,
      isActive: s.isActive,
      position: s.position,
      conditions: s.conditions,
      cursor: s.cursor,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(inquiryAssignmentRules)
      .values({ id: s.id, ...values, createdAt: s.createdAt, createdBy: actorId })
      .onConflictDoUpdate({ target: inquiryAssignmentRules.id, set: values });
    await this.db
      .delete(inquiryAssignmentRuleAgents)
      .where(eq(inquiryAssignmentRuleAgents.ruleId, s.id));
    await this.db.insert(inquiryAssignmentRuleAgents).values(
      s.agents.map((agent, position) => ({
        ruleId: s.id,
        userId: agent.userId,
        weight: agent.weight,
        position,
        createdAt: s.updatedAt,
        createdBy: actorId,
      })),
    );
  }

  async delete(id: InquiryRuleId): Promise<void> {
    await this.db.delete(inquiryAssignmentRules).where(eq(inquiryAssignmentRules.id, id));
  }

  private async restore(row: RuleRow): Promise<InquiryAssignmentRule> {
    const agents = await agentsByRule(this.db, [row.id]);
    return InquiryAssignmentRule.restore(toRuleSnapshot(row, agents.get(row.id) ?? []));
  }
}

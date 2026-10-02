import { parseId, type Actor, type AuditState, type AuditTarget } from '../../shared';
import type { ClientListingSummary, InquiryRuleRow } from '../contracts';
import type { InquiryRuleRepository } from '../domain/client.repository';
import type { InquiryAssignmentRule, InquiryRuleSnapshot } from '../domain/inquiry-assignment-rule';
import type { WeightedAgent } from '../domain/weighted-distribution';

import type { AgentNotFoundError } from './client-support';
import type { ClientAgents } from './ports/client-agents';
import type { ClientListings } from './ports/client-record-query';

// Lo que comparten los casos de uso de las reglas de asignación de consultas.

export interface InquiryRuleNotFoundError {
  readonly type: 'InquiryRuleNotFound';
}

export function ruleTarget(action: string, ruleId: string): AuditTarget {
  return { action, entityType: 'inquiry_rule', entityId: ruleId, clientIds: [] };
}

/** Lo que se audita de una regla: valores crudos, con los agentes y propiedades por ID. */
export function ruleAuditState(rule: InquiryAssignmentRule): AuditState {
  const s = rule.toSnapshot();
  return {
    name: s.name,
    isActive: s.isActive,
    position: s.position,
    channels: [...s.conditions.channels],
    operations: [...s.conditions.operations],
    propertyTypes: [...s.conditions.propertyTypes],
    neighborhoods: [...s.conditions.neighborhoods],
    propertyIds: [...s.conditions.propertyIds],
    developmentIds: [...s.conditions.developmentIds],
    agents: s.agents.map((a) => `${a.userId}:${String(a.weight)}`),
  };
}

export async function findRule(
  repository: InquiryRuleRepository,
  id: string,
): Promise<InquiryAssignmentRule | undefined> {
  const parsed = parseId<'InquiryAssignmentRule'>(id);
  return parsed.isOk() ? repository.findById(parsed.value) : undefined;
}

/** Cada agente de la regla tiene que ser un usuario activo. */
export async function checkRuleAgents(
  agents: ClientAgents,
  ruleAgents: readonly WeightedAgent[],
): Promise<AgentNotFoundError | undefined> {
  for (const agent of ruleAgents) {
    if ((await agents.find(agent.userId)) === undefined) return { type: 'AgentNotFound' };
  }
  return undefined;
}

/** `summaries` resuelve de a una página (100, el máximo): una regla puede tener hasta 50 propiedades. */
const SUMMARIES_PAGE = 100;

async function summariesInPages(
  listings: ClientListings,
  propertyIds: readonly string[],
  actor: Actor,
): Promise<ReadonlyMap<string, ClientListingSummary>> {
  const found = new Map<string, ClientListingSummary>();
  for (let start = 0; start < propertyIds.length; start += SUMMARIES_PAGE) {
    const page = await listings.summaries(propertyIds.slice(start, start + SUMMARIES_PAGE), actor);
    for (const [id, summary] of page) found.set(id, summary);
  }
  return found;
}

/** Arma las filas: nombres de los agentes y resumen de las propiedades, de a una página. */
export async function toRuleRows(
  items: readonly { readonly rule: InquiryRuleSnapshot; readonly priority: number }[],
  total: number,
  deps: { readonly agents: ClientAgents; readonly listings: ClientListings },
  actor: Actor,
): Promise<InquiryRuleRow[]> {
  const userIds = [...new Set(items.flatMap((i) => i.rule.agents.map((a) => a.userId)))];
  const propertyIds = [...new Set(items.flatMap((i) => i.rule.conditions.propertyIds))];
  const [names, listings] = await Promise.all([
    deps.agents.names(userIds),
    summariesInPages(deps.listings, propertyIds, actor),
  ]);
  return items.map(({ rule, priority }) => {
    const totalWeight = rule.agents.reduce((sum, a) => sum + a.weight, 0);
    const c = rule.conditions;
    return {
      id: rule.id,
      name: rule.name,
      isActive: rule.isActive,
      priority,
      conditions: {
        channels: c.channels,
        operations: c.operations,
        propertyTypes: c.propertyTypes,
        neighborhoods: c.neighborhoods,
        properties: c.propertyIds.map((id) => ({ id, summary: listings.get(id) })),
        developmentIds: c.developmentIds,
      },
      agents: rule.agents.map((a) => ({
        user: { id: a.userId, name: names.get(a.userId) },
        weight: a.weight,
        share: totalWeight === 0 ? 0 : Math.round((a.weight / totalWeight) * 100),
      })),
      updatedAt: rule.updatedAt,
      canMoveUp: priority > 1,
      canMoveDown: priority < total,
    };
  });
}

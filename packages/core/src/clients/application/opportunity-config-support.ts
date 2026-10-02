import type { AuditState, AuditTarget } from '../../shared';
import type { OpportunityCloseReason } from '../domain/opportunity-close-reason';
import { OPPORTUNITY_RULES, type OpportunityRules } from '../domain/opportunity-settings';
import type { OpportunityStage } from '../domain/opportunity-stage';

import type { ClientsTransaction } from './ports/clients-transaction';
import { idOf } from './tag-support';

// Lo que comparten los commands de la configuración de oportunidades (Mi empresa).

export interface OpportunityStageNotFoundError {
  readonly type: 'StageNotFound';
}

export interface CloseReasonNotFoundError {
  readonly type: 'CloseReasonNotFound';
}

/** La configuración no tiene datos de clientes: `clientIds` vacío. */
export function configTarget(entityType: string, action: string, entityId: string): AuditTarget {
  return { action, entityType, entityId, clientIds: [] };
}

export function stageAuditState(stage: OpportunityStage): AuditState {
  const { name, color, position, category, isActive } = stage.toSnapshot();
  return { name, color, position, category, isActive };
}

export function closeReasonAuditState(reason: OpportunityCloseReason): AuditState {
  const { name, rating, position, isActive } = reason.toSnapshot();
  return { name, rating, position, isActive };
}

export function rulesAuditState(rules: OpportunityRules): AuditState {
  return Object.fromEntries(OPPORTUNITY_RULES.map((rule) => [rule, rules[rule]]));
}

export async function findStage(tx: ClientsTransaction, rawId: string) {
  const id = idOf<'OpportunityStage'>(rawId);
  return id === undefined ? undefined : tx.stages.findById(id);
}

export async function findCloseReason(tx: ClientsTransaction, rawId: string) {
  const id = idOf<'OpportunityCloseReason'>(rawId);
  return id === undefined ? undefined : tx.closeReasons.findById(id);
}

import { err, ok, type Result } from '../../shared/domain/result';

import {
  firstActiveStageOf,
  type OpportunityStage,
  type OpportunityStageId,
} from './opportunity-stage';
import { isOpenStatus, type OpportunityStatus } from './opportunity-status';

/**
 * Reglas automáticas de estado que se configuran en Mi empresa. Las de envíos y reacciones
 * ("tras enviar email o WhatsApp", "me gusta / no me gusta") llegan con #11.
 */
export const OPPORTUNITY_RULES = ['onCreate', 'onAssign', 'onReactivate', 'forOwners'] as const;
export type OpportunityRule = (typeof OPPORTUNITY_RULES)[number];

/** El estado que aplica cada regla. Sin estado, la regla no hace nada. */
export type OpportunityRules = Readonly<Record<OpportunityRule, OpportunityStageId | undefined>>;

export const NO_RULES: OpportunityRules = {
  onCreate: undefined,
  onAssign: undefined,
  onReactivate: undefined,
  forOwners: undefined,
};

export interface InvalidRuleStageError {
  readonly type: 'InvalidRuleStage';
  readonly rule: OpportunityRule;
}

/**
 * Una regla solo puede elegir un estado activo de una categoría abierta. Al crear, además, no
 * puede ser "Aplica a otra inmobiliaria": eso lo decide si Norde tiene stock para ofrecerle.
 */
export function checkRules(
  rules: OpportunityRules,
  stages: readonly OpportunityStage[],
): Result<OpportunityRules, InvalidRuleStageError> {
  for (const rule of OPPORTUNITY_RULES) {
    const stageId = rules[rule];
    if (stageId === undefined) continue;
    const stage = stages.find((s) => s.id === stageId);
    const valid =
      stage !== undefined &&
      stage.isActive &&
      isOpenStatus(stage.category) &&
      !(rule === 'onCreate' && stage.category === 'referred_to_partner');
    if (!valid) return err({ type: 'InvalidRuleStage', rule });
  }
  return ok(rules);
}

/** Si alguna regla elige este estado: no se puede desactivar. */
export function isStageUsedByRules(rules: OpportunityRules, stageId: OpportunityStageId): boolean {
  return OPPORTUNITY_RULES.some((rule) => rules[rule] === stageId);
}

/**
 * El estado en el que nace una oportunidad. Si Norde no tiene stock para ofrecerle, el primero de
 * "Aplica a otra inmobiliaria"; si no, el de la regla "al crear" (si sigue activo) o el primero
 * de "nuevo".
 */
export function initialStage(
  stages: readonly OpportunityStage[],
  rules: OpportunityRules,
  noMatchingStock: boolean,
): OpportunityStage | undefined {
  if (noMatchingStock) return firstActiveStageOf(stages, 'referred_to_partner');
  const configured = stages.find((s) => s.id === rules.onCreate && s.isActive);
  return configured ?? firstActiveStageOf(stages, 'new');
}

/** Lo que pasó con una oportunidad que puede disparar una regla automática. */
export type OpportunityRuleTrigger =
  | { readonly kind: 'assigned'; readonly toAgentId: string | undefined }
  | { readonly kind: 'request_added' }
  | { readonly kind: 'listings_featured' }
  | { readonly kind: 'created'; readonly ownerClient: boolean };

/**
 * Qué regla aplica: "al asignar" cuando pasa a un agente (no al quedar sin agente), "al reactivar"
 * cuando una derivada a socia vuelve a consultar o se le destaca una propiedad, y "para propietarios" cuando nace la de un
 * contacto propietario. Una cerrada no cambia.
 */
export function automaticRuleFor(
  trigger: OpportunityRuleTrigger,
  status: OpportunityStatus,
): OpportunityRule | undefined {
  if (!isOpenStatus(status)) return undefined;
  switch (trigger.kind) {
    case 'assigned':
      return trigger.toAgentId === undefined ? undefined : 'onAssign';
    case 'request_added':
    case 'listings_featured':
      return status === 'referred_to_partner' ? 'onReactivate' : undefined;
    case 'created':
      return trigger.ownerClient ? 'forOwners' : undefined;
  }
}

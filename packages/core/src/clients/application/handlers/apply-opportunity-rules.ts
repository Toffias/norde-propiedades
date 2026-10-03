import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { hasOwnerType } from '../../domain/client-values';
import {
  automaticRuleFor,
  type OpportunityRule,
  type OpportunityRuleTrigger,
} from '../../domain/opportunity-settings';
import { findOpportunity, moveOpportunity } from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/**
 * El evento que llegó, ya leído: reasignada, volvió a consultar, le destacaron propiedades o
 * recién creada.
 */
export interface OpportunityRuleEvent {
  /** El ID del evento: un cambio por evento, aunque la cola lo entregue dos veces. */
  readonly eventId: string;
  readonly opportunityId: string;
  readonly trigger:
    | { readonly kind: 'assigned'; readonly toAgentId: string | undefined }
    | { readonly kind: 'request_added' }
    | { readonly kind: 'listings_featured' }
    | { readonly kind: 'created' };
}

/** Qué hizo la regla. No aplicar una no es un error: la mayoría de los eventos no disparan ninguna. */
export type OpportunityRuleOutcome =
  | { readonly applied: true; readonly rule: OpportunityRule }
  | {
      readonly applied: false;
      readonly reason: 'not_found' | 'already_applied' | 'no_rule' | 'unchanged' | 'not_allowed';
    };

/**
 * Las reglas automáticas de estado de Mi empresa: "al asignar" (pasa a un agente), "al reactivar"
 * (una derivada a socia vuelve a consultar o le destacan una propiedad) y "para propietarios" (nace la de un contacto
 * propietario). Mueven la oportunidad al estado configurado si el dominio lo permite; si no, no
 * hacen nada. Son idempotentes por evento, y quedan en el historial, la actividad y la auditoría
 * como cambios del sistema.
 */
export class ApplyOpportunityRules {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    event: OpportunityRuleEvent,
    actor: Actor,
  ): Promise<Result<OpportunityRuleOutcome, ForbiddenError>> {
    // Solo el sistema: un usuario con `opportunities:*` no dispara reglas.
    if (actor.kind !== 'system' || !actor.can('opportunities:apply-rules')) {
      return err({ type: 'Forbidden' });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<OpportunityRuleOutcome, never>> => {
      const opportunity = await findOpportunity(tx, event.opportunityId);
      if (!opportunity) return ok({ applied: false, reason: 'not_found' });
      if (await tx.opportunities.hasStatusChangeFrom(event.eventId)) {
        return ok({ applied: false, reason: 'already_applied' });
      }

      let trigger: OpportunityRuleTrigger;
      if (event.trigger.kind === 'created') {
        const client = await tx.clients.findById(opportunity.clientId);
        const types = client?.toSnapshot().clientTypes ?? [];
        trigger = { kind: 'created', ownerClient: hasOwnerType(types) };
      } else {
        trigger = event.trigger;
      }
      const rule = automaticRuleFor(trigger, opportunity.status);
      if (rule === undefined) return ok({ applied: false, reason: 'no_rule' });
      const rules = await tx.opportunitySettings.get();
      const stageId = rules[rule];
      const stage = stageId === undefined ? undefined : await tx.stages.findById(stageId);
      if (!stage) return ok({ applied: false, reason: 'no_rule' });

      const moved = await moveOpportunity(tx, opportunity, stage.ref(), actor, {
        ids: this.deps.ids,
        now,
        sourceEventId: event.eventId,
      });
      if (moved.isErr()) return ok({ applied: false, reason: 'not_allowed' });
      return ok(moved.value ? { applied: true, rule } : { applied: false, reason: 'unchanged' });
    });
  }
}

import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { ClientRepository, OpportunityRepository } from '../../domain/client.repository';
import type { OpportunityCreated, OpportunityRequestAdded } from '../../domain/opportunity.events';
import type { TeamNotifier } from '../ports/team-notifier';

export type NotifyTeamOfOpportunityError =
  ForbiddenError | { readonly type: 'OpportunityNotFound' } | { readonly type: 'ClientNotFound' };

/**
 * Reacción a `OpportunityCreated` y `OpportunityRequestAdded`: avisa al equipo comercial.
 * Idempotente a nivel de negocio (solo lee y avisa); el job garantiza una entrega por evento.
 */
export class NotifyTeamOfOpportunity {
  constructor(
    private readonly deps: {
      readonly clients: ClientRepository;
      readonly opportunities: OpportunityRepository;
      readonly notifier: TeamNotifier;
    },
  ) {}

  async execute(
    event: Pick<OpportunityCreated | OpportunityRequestAdded, 'type' | 'payload' | 'occurredAt'>,
    actor: Actor,
  ): Promise<Result<void, NotifyTeamOfOpportunityError>> {
    if (!actor.can('clients:read')) return err({ type: 'Forbidden' });

    const opportunityId = parseId<'Opportunity'>(event.payload.opportunityId);
    if (opportunityId.isErr()) return err({ type: 'OpportunityNotFound' });
    const opportunity = await this.deps.opportunities.findById(opportunityId.value);
    if (!opportunity) return err({ type: 'OpportunityNotFound' });

    const client = await this.deps.clients.findById(opportunity.clientId);
    if (!client) return err({ type: 'ClientNotFound' });

    const snapshot = opportunity.toSnapshot();
    await this.deps.notifier.notifyOpportunity({
      kind: event.type === 'clients.opportunity_created' ? 'new' : 'follow_up',
      opportunityId: opportunity.id,
      clientId: client.id,
      clientName: client.name,
      phone: client.phone?.e164,
      email: client.email?.value,
      channel: snapshot.originChannel,
      type: snapshot.type,
      intent: snapshot.intent,
      status: snapshot.status,
      propertyId: snapshot.propertyId,
      latestNote: snapshot.notes.at(-1)?.text,
      occurredAt: event.occurredAt,
    });
    return ok(undefined);
  }
}

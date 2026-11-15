import { z } from 'zod';

import {
  err,
  ok,
  parseId,
  runIdempotent,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { OpportunityCreated, OpportunityRequestAdded } from '../../domain/opportunity.events';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { TeamNotifier } from '../ports/team-notifier';

/** Lo que queda guardado de un aviso ya mandado: nada, alcanza con saber que se mandó. */
const SentSchema = z.object({});

export type NotifyTeamOfOpportunityError =
  ForbiddenError | { readonly type: 'OpportunityNotFound' } | { readonly type: 'ClientNotFound' };

/**
 * Reacción a `OpportunityCreated` y `OpportunityRequestAdded`: avisa al equipo comercial. Un aviso
 * por evento: si la cola lo vuelve a entregar después de mandarlo, no se repite (la clave es el ID
 * del evento). Si el aviso falla, la transacción libera la clave y el reintento lo vuelve a mandar.
 */
export class NotifyTeamOfOpportunity {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly notifier: TeamNotifier;
    },
  ) {}

  async execute(
    event: Pick<OpportunityCreated | OpportunityRequestAdded, 'type' | 'payload' | 'occurredAt'> & {
      readonly id: string;
    },
    actor: Actor,
  ): Promise<Result<void, NotifyTeamOfOpportunityError>> {
    if (!actor.can('clients:read')) return err({ type: 'Forbidden' });

    const opportunityId = parseId<'Opportunity'>(event.payload.opportunityId);
    if (opportunityId.isErr()) return err({ type: 'OpportunityNotFound' });

    const sent = await this.deps.uow.run((tx) =>
      runIdempotent(
        tx.idempotency,
        { actorId: actor.id, command: 'NotifyTeamOfOpportunity', key: event.id },
        SentSchema,
        async (): Promise<Result<z.infer<typeof SentSchema>, NotifyTeamOfOpportunityError>> => {
          const opportunity = await tx.opportunities.findById(opportunityId.value);
          if (!opportunity) return err({ type: 'OpportunityNotFound' });
          const client = await tx.clients.findById(opportunity.clientId);
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
          return ok({});
        },
      ),
    );
    return sent.isErr() ? err(sent.error) : ok(undefined);
  }
}

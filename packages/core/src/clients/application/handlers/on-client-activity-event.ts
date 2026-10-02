import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { conversationActivity, inquiryActivity } from '../../domain/client-activity';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** Un evento que deja una entrada en el timeline del cliente, tal como lo entrega la cola. */
export type ClientActivityEvent = {
  /** ID del evento: es el de la entrada, así una reentrega no la duplica. */
  readonly id: string;
  readonly occurredAt: Date;
} & (
  | {
      readonly type: 'clients.opportunity_created' | 'clients.opportunity_request_added';
      readonly payload: { readonly opportunityId: string; readonly clientId: string };
    }
  | {
      readonly type: 'conversations.conversation_linked_to_client';
      readonly payload: {
        readonly conversationId: string;
        readonly clientId: string;
        readonly channel: string;
      };
    }
);

export type RecordClientActivityError =
  | ForbiddenError
  | { readonly type: 'InvalidEvent' }
  | { readonly type: 'OpportunityNotFound' }
  | { readonly type: 'ClientNotFound' };

/**
 * Reacción a eventos que el cliente tiene que ver en su actividad: una consulta nueva (o una que
 * se repite sobre una oportunidad abierta) y una conversación del agente de IA vinculada a él.
 *
 * Idempotente: la entrada usa el ID del evento. Es una proyección de algo que ya quedó registrado
 * (la oportunidad, la conversación): no se audita aparte.
 */
export class RecordClientActivity {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    event: ClientActivityEvent,
    actor: Actor,
  ): Promise<Result<{ readonly recorded: boolean }, RecordClientActivityError>> {
    if (!actor.can('clients:record-activity')) return err({ type: 'Forbidden' });
    if (parseId(event.id).isErr()) return err({ type: 'InvalidEvent' });

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly recorded: boolean }, RecordClientActivityError>> => {
        if (event.type === 'conversations.conversation_linked_to_client') {
          const clientId = parseId<'Client'>(event.payload.clientId);
          if (clientId.isErr()) return err({ type: 'ClientNotFound' });
          const client = await tx.clients.findById(clientId.value);
          if (!client) return err({ type: 'ClientNotFound' });
          const recorded = await tx.activities.record(
            conversationActivity({
              id: event.id,
              clientId: client.id,
              conversationId: event.payload.conversationId,
              channel: event.payload.channel,
              occurredAt: event.occurredAt,
            }),
          );
          return ok({ recorded });
        }

        const opportunityId = parseId<'Opportunity'>(event.payload.opportunityId);
        if (opportunityId.isErr()) return err({ type: 'OpportunityNotFound' });
        const opportunity = await tx.opportunities.findById(opportunityId.value);
        if (!opportunity) return err({ type: 'OpportunityNotFound' });
        const recorded = await tx.activities.record(
          inquiryActivity({
            id: event.id,
            opportunity: opportunity.toSnapshot(),
            followUp: event.type === 'clients.opportunity_request_added',
            occurredAt: event.occurredAt,
          }),
        );
        return ok({ recorded });
      },
    );
  }
}

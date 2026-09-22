import type { NotifyTeamOfOpportunity } from '@norde/core/clients';
import type { Actor } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

/** Evento de dominio tal como lo entrega la cola. */
export interface DeliveredEvent {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
}

/**
 * Reacción a un evento. Cada una llama **un** caso de uso. Si lanza, la cola reintenta con
 * backoff; un error esperado (`Err`) se registra y no se reintenta.
 */
export interface EventSubscription {
  readonly eventType: string;
  readonly name: string;
  handle(event: DeliveredEvent): Promise<void>;
}

const OpportunityPayloadSchema = z.object({ opportunityId: z.string(), clientId: z.string() });

export function eventSubscriptions(deps: {
  readonly notifyTeam: Pick<NotifyTeamOfOpportunity, 'execute'>;
  readonly actor: Actor;
  readonly logger: Logger;
}): EventSubscription[] {
  const notifyTeam = (
    eventType: 'clients.opportunity_created' | 'clients.opportunity_request_added',
  ): EventSubscription => ({
    eventType,
    name: 'notify-team',
    handle: async (event) => {
      const payload = OpportunityPayloadSchema.parse(event.payload);
      const result = await deps.notifyTeam.execute(
        { type: eventType, occurredAt: event.occurredAt, payload },
        deps.actor,
      );
      if (result.isErr()) {
        deps.logger.error({ eventId: event.id, error: result.error }, 'Team notification skipped');
      }
    },
  });

  return [
    notifyTeam('clients.opportunity_created'),
    notifyTeam('clients.opportunity_request_added'),
  ];
}

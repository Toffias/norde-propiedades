import type { NotifyTeamOfOpportunity } from '@norde/core/clients';
import type {
  DeleteStoredMediaFiles,
  GeneratePropertyMediaVariants,
  RenderPropertyDocument,
} from '@norde/core/properties';
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
const MediaPayloadSchema = z.object({ mediaId: z.uuid() });
const MediaDeletedPayloadSchema = z.object({ storageKeys: z.array(z.string()).max(10) });
const DocumentPayloadSchema = z.object({ documentId: z.uuid() });

/** Los jobs de la ficha de propiedad (#6): variantes de fotos, limpieza del storage y PDF. */
export interface PropertyJobs {
  readonly generateMediaVariants: Pick<GeneratePropertyMediaVariants, 'execute'>;
  readonly deleteStoredMediaFiles: Pick<DeleteStoredMediaFiles, 'execute'>;
  readonly renderDocument: Pick<RenderPropertyDocument, 'execute'>;
}

function propertySubscriptions(
  jobs: PropertyJobs,
  actor: Actor,
  logger: Logger,
): EventSubscription[] {
  const skipped = (event: DeliveredEvent, error: unknown) => {
    logger.error({ eventId: event.id, type: event.type, error }, 'Property job skipped');
  };
  return [
    {
      eventType: 'properties.media_variants_requested',
      name: 'generate-variants',
      handle: async (event) => {
        const { mediaId } = MediaPayloadSchema.parse(event.payload);
        const result = await jobs.generateMediaVariants.execute({ mediaId }, actor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
    {
      eventType: 'properties.media_deleted',
      name: 'delete-files',
      handle: async (event) => {
        const { storageKeys } = MediaDeletedPayloadSchema.parse(event.payload);
        const result = await jobs.deleteStoredMediaFiles.execute({ storageKeys }, actor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
    {
      eventType: 'properties.document_requested',
      name: 'render-document',
      handle: async (event) => {
        const { documentId } = DocumentPayloadSchema.parse(event.payload);
        const result = await jobs.renderDocument.execute({ documentId }, actor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
  ];
}

export function eventSubscriptions(deps: {
  readonly notifyTeam: Pick<NotifyTeamOfOpportunity, 'execute'>;
  readonly properties: PropertyJobs;
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
    ...propertySubscriptions(deps.properties, deps.actor, deps.logger),
  ];
}

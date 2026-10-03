import type {
  ApplyOpportunityRules,
  NotifyTeamOfOpportunity,
  OpportunityRuleEvent,
  RecordClientActivity,
  RouteInquiry,
  RunClientImport,
  RunOpportunityBulkOperation,
} from '@norde/core/clients';
import type { EraseClientConversations } from '@norde/core/conversations';
import type { RemoveErasedClientFavorites } from '@norde/core/identity';
import type {
  DeleteStoredMediaFiles,
  UnlinkErasedClients,
  GenerateMediaVariants,
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
const ConversationLinkedPayloadSchema = z.object({
  conversationId: z.string(),
  clientId: z.string(),
  // Los eventos anteriores a que el payload trajera el canal no lo tienen.
  channel: z.string().default('unknown'),
});
const MediaPayloadSchema = z.object({ mediaId: z.uuid() });
const MediaDeletedPayloadSchema = z.object({ storageKeys: z.array(z.string()).max(10) });
const DocumentPayloadSchema = z.object({ documentId: z.uuid() });
const ImportPayloadSchema = z.object({ importId: z.uuid() });
const ErasedPayloadSchema = z.object({ erasedClientIds: z.array(z.uuid()).min(1) });
const RulePayloadSchema = z.object({
  opportunityId: z.string(),
  // Solo en las reasignaciones; sin agente, la dejó sin nadie a cargo.
  toAgentId: z.string().nullish(),
});
const BulkPayloadSchema = z.object({ operationId: z.uuid() });
const InquiryPayloadSchema = z.object({ inquiryId: z.uuid() });

/** Las reglas automáticas de estado y las acciones masivas encoladas (#9). */
export interface OpportunityJobs {
  readonly applyRules: Pick<ApplyOpportunityRules, 'execute'>;
  readonly runBulk: Pick<RunOpportunityBulkOperation, 'execute'>;
}

function opportunitySubscriptions(
  jobs: OpportunityJobs,
  actor: Actor,
  logger: Logger,
): EventSubscription[] {
  const skipped = (event: DeliveredEvent, error: unknown) => {
    logger.error({ eventId: event.id, type: event.type, error }, 'Opportunity job skipped');
  };
  const rule = (
    eventType:
      | 'clients.opportunity_reassigned'
      | 'clients.opportunity_request_added'
      | 'clients.opportunity_listings_featured'
      | 'clients.opportunity_created',
  ): EventSubscription => ({
    eventType,
    name: 'apply-rules',
    handle: async (event) => {
      const payload = RulePayloadSchema.parse(event.payload);
      const trigger = ((): OpportunityRuleEvent['trigger'] => {
        switch (eventType) {
          case 'clients.opportunity_reassigned':
            return { kind: 'assigned', toAgentId: payload.toAgentId ?? undefined };
          case 'clients.opportunity_request_added':
            return { kind: 'request_added' };
          case 'clients.opportunity_listings_featured':
            return { kind: 'listings_featured' };
          case 'clients.opportunity_created':
            return { kind: 'created' };
        }
      })();
      const result = await jobs.applyRules.execute(
        { eventId: event.id, opportunityId: payload.opportunityId, trigger },
        actor,
      );
      if (result.isErr()) skipped(event, result.error);
    },
  });
  return [
    rule('clients.opportunity_reassigned'),
    rule('clients.opportunity_request_added'),
    rule('clients.opportunity_listings_featured'),
    rule('clients.opportunity_created'),
    {
      eventType: 'clients.opportunity_bulk_requested',
      name: 'run-bulk',
      handle: async (event) => {
        const { operationId } = BulkPayloadSchema.parse(event.payload);
        const result = await jobs.runBulk.execute({ operationId }, actor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
  ];
}

/**
 * Cada módulo que guarda el ID de un cliente borra o desvincula lo suyo cuando se suprimen sus
 * datos (Ley 25.326). Lo de clients ya se borró en la misma transacción que la constancia.
 */
export interface ErasureJobs {
  readonly conversations: Pick<EraseClientConversations, 'execute'>;
  readonly properties: Pick<UnlinkErasedClients, 'execute'>;
  readonly favorites: Pick<RemoveErasedClientFavorites, 'execute'>;
}

/** Los jobs de la ficha de propiedad (#6): variantes de fotos, limpieza del storage y PDF. */
export interface PropertyJobs {
  readonly generateMediaVariants: Pick<GenerateMediaVariants, 'execute'>;
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

/** La actividad de la ficha del cliente (#8): consultas y conversaciones del agente de IA. */
function activitySubscriptions(
  recordActivity: Pick<RecordClientActivity, 'execute'>,
  actor: Actor,
  logger: Logger,
): EventSubscription[] {
  const skipped = (event: DeliveredEvent, error: unknown) => {
    logger.error({ eventId: event.id, type: event.type, error }, 'Client activity skipped');
  };
  const opportunity = (
    eventType: 'clients.opportunity_created' | 'clients.opportunity_request_added',
  ): EventSubscription => ({
    eventType,
    name: 'record-activity',
    handle: async (event) => {
      const payload = OpportunityPayloadSchema.parse(event.payload);
      const result = await recordActivity.execute(
        { id: event.id, type: eventType, occurredAt: event.occurredAt, payload },
        actor,
      );
      if (result.isErr()) skipped(event, result.error);
    },
  });
  return [
    opportunity('clients.opportunity_created'),
    opportunity('clients.opportunity_request_added'),
    {
      eventType: 'conversations.conversation_linked_to_client',
      name: 'record-activity',
      handle: async (event) => {
        const payload = ConversationLinkedPayloadSchema.parse(event.payload);
        const result = await recordActivity.execute(
          {
            id: event.id,
            type: 'conversations.conversation_linked_to_client',
            occurredAt: event.occurredAt,
            payload,
          },
          actor,
        );
        if (result.isErr()) skipped(event, result.error);
      },
    },
  ];
}

/** La supresión de datos de un cliente (#8): cada módulo borra lo suyo. */
function erasureSubscriptions(
  jobs: ErasureJobs,
  actor: Actor,
  logger: Logger,
): EventSubscription[] {
  const erase = (
    name: string,
    useCase: {
      execute(input: { clientIds: string[] }, actor: Actor): Promise<{ isErr(): boolean }>;
    },
  ): EventSubscription => ({
    eventType: 'clients.client_erased',
    name,
    handle: async (event) => {
      const { erasedClientIds } = ErasedPayloadSchema.parse(event.payload);
      const result = await useCase.execute({ clientIds: erasedClientIds }, actor);
      if (result.isErr()) logger.error({ eventId: event.id, name }, 'Client erasure skipped');
    },
  });
  return [
    erase('erase-conversations', jobs.conversations),
    erase('unlink-properties', jobs.properties),
    erase('remove-favorites', jobs.favorites),
  ];
}

function routeInquirySubscription(
  routeInquiry: Pick<RouteInquiry, 'execute'>,
  actor: Actor,
  logger: Logger,
): EventSubscription {
  return {
    eventType: 'clients.inquiry_received',
    name: 'route-inquiry',
    handle: async (event) => {
      const { inquiryId } = InquiryPayloadSchema.parse(event.payload);
      const result = await routeInquiry.execute({ inquiryId }, actor);
      if (result.isErr()) {
        logger.error({ eventId: event.id, error: result.error }, 'Inquiry routing skipped');
      } else if (!result.value.routed) {
        // Queda pendiente en la bandeja: no es un error.
        logger.info({ eventId: event.id, reason: result.value.reason }, 'Inquiry left pending');
      }
    },
  };
}

export function eventSubscriptions(deps: {
  readonly notifyTeam: Pick<NotifyTeamOfOpportunity, 'execute'>;
  readonly recordActivity: Pick<RecordClientActivity, 'execute'>;
  readonly properties: PropertyJobs;
  readonly erasure: ErasureJobs;
  readonly runImport: Pick<RunClientImport, 'execute'>;
  readonly opportunities: OpportunityJobs;
  /** El reparto automático de las consultas que entran (#10). Sin él, quedan pendientes (#48). */
  readonly routeInquiry?: Pick<RouteInquiry, 'execute'>;
  readonly actor: Actor;
  /** El de las importaciones: los contactos quedan creados por `system:import`. */
  readonly importActor: Actor;
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
    ...activitySubscriptions(deps.recordActivity, deps.actor, deps.logger),
    ...erasureSubscriptions(deps.erasure, deps.actor, deps.logger),
    ...opportunitySubscriptions(deps.opportunities, deps.actor, deps.logger),
    {
      eventType: 'clients.import_requested',
      name: 'run-import',
      handle: async (event) => {
        const { importId } = ImportPayloadSchema.parse(event.payload);
        const result = await deps.runImport.execute({ importId }, deps.importActor);
        if (result.isErr()) {
          deps.logger.error({ eventId: event.id, error: result.error }, 'Client import skipped');
        }
      },
    },
    ...(deps.routeInquiry
      ? [routeInquirySubscription(deps.routeInquiry, deps.actor, deps.logger)]
      : []),
  ];
}

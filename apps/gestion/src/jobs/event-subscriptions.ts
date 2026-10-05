import type {
  DeleteAppraisalPhotoFiles,
  EraseClientAppraisals,
  MoveMergedClientAppraisals,
} from '@norde/core/appraisals';
import type {
  ApplyOpportunityRules,
  NotifyTeamOfOpportunity,
  OpportunityRuleEvent,
  RecordClientActivity,
  RouteInquiry,
  RunClientImport,
  RunOpportunityBulkOperation,
} from '@norde/core/clients';
import type {
  EraseClientConversations,
  MoveMergedClientConversations,
} from '@norde/core/conversations';
import type { MoveMergedClientFavorites, RemoveErasedClientFavorites } from '@norde/core/identity';
import {
  CreatePropertyFromAppraisalInputSchema,
  type CreatePropertyFromAppraisal,
  type DeleteStoredMediaFiles,
  type MoveMergedClientLinks,
  type UnlinkErasedClients,
  type GenerateMediaVariants,
  type RenderPropertyDocument,
  type RunDevelopmentUnitImport,
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
const MergedPayloadSchema = z.object({ clientId: z.uuid(), mergedClientId: z.uuid() });
const RulePayloadSchema = z.object({
  opportunityId: z.string(),
  // Solo en las reasignaciones; sin agente, la dejó sin nadie a cargo.
  toAgentId: z.string().nullish(),
});
const BulkPayloadSchema = z.object({ operationId: z.uuid() });
const InquiryPayloadSchema = z.object({ inquiryId: z.uuid() });
const AppraisalPhotoDeletedPayloadSchema = z.object({
  storageKeys: z.array(z.string()).max(30),
});

/** Las fotos y la conversión en propiedad de las tasaciones (#12). */
export interface AppraisalJobs {
  readonly deletePhotoFiles: Pick<DeleteAppraisalPhotoFiles, 'execute'>;
  /** Corre con `conversionActor`: crear la propiedad pide un código de la numeración. */
  readonly createProperty: Pick<CreatePropertyFromAppraisal, 'execute'>;
}

function appraisalSubscriptions(
  jobs: AppraisalJobs,
  actors: { readonly actor: Actor; readonly conversionActor: Actor },
  logger: Logger,
): EventSubscription[] {
  const skipped = (event: DeliveredEvent, error: unknown) => {
    logger.error({ eventId: event.id, type: event.type, error }, 'Appraisal job skipped');
  };
  return [
    {
      eventType: 'appraisals.appraisal_photo_deleted',
      name: 'delete-photo-files',
      handle: async (event) => {
        const { storageKeys } = AppraisalPhotoDeletedPayloadSchema.parse(event.payload);
        const result = await jobs.deletePhotoFiles.execute({ storageKeys }, actors.actor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
    {
      eventType: 'appraisals.appraisal_converted',
      name: 'create-property',
      handle: async (event) => {
        const input = CreatePropertyFromAppraisalInputSchema.parse(event.payload);
        const result = await jobs.createProperty.execute(input, actors.conversionActor);
        if (result.isErr()) skipped(event, result.error);
      },
    },
  ];
}

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
  readonly appraisals: Pick<EraseClientAppraisals, 'execute'>;
  readonly conversations: Pick<EraseClientConversations, 'execute'>;
  readonly properties: Pick<UnlinkErasedClients, 'execute'>;
  readonly favorites: Pick<RemoveErasedClientFavorites, 'execute'>;
}

/**
 * Cada módulo que guarda el ID de un cliente pasa lo suyo al contacto que queda cuando se unifican
 * dos. Lo de clients ya se movió en la misma transacción que la unificación.
 */
export interface MergeJobs {
  readonly appraisals: Pick<MoveMergedClientAppraisals, 'execute'>;
  readonly conversations: Pick<MoveMergedClientConversations, 'execute'>;
  readonly properties: Pick<MoveMergedClientLinks, 'execute'>;
  readonly favorites: Pick<MoveMergedClientFavorites, 'execute'>;
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
    erase('erase-appraisals', jobs.appraisals),
  ];
}

/** La unificación de dos contactos (#8): cada módulo pasa lo suyo al que queda. */
function mergeSubscriptions(jobs: MergeJobs, actor: Actor, logger: Logger): EventSubscription[] {
  const move = (
    name: string,
    useCase: {
      execute(
        input: { clientId: string; mergedClientId: string },
        actor: Actor,
      ): Promise<{ isErr(): boolean }>;
    },
  ): EventSubscription => ({
    eventType: 'clients.clients_merged',
    name,
    handle: async (event) => {
      const payload = MergedPayloadSchema.parse(event.payload);
      const result = await useCase.execute(payload, actor);
      if (result.isErr()) logger.error({ eventId: event.id, name }, 'Client merge skipped');
    },
  });
  return [
    move('move-conversations', jobs.conversations),
    move('move-properties', jobs.properties),
    move('move-favorites', jobs.favorites),
    move('move-appraisals', jobs.appraisals),
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
  readonly appraisals: AppraisalJobs;
  readonly erasure: ErasureJobs;
  readonly merge: MergeJobs;
  readonly runImport: Pick<RunClientImport, 'execute'>;
  /** La importación de unidades de un emprendimiento desde Excel (#7). */
  readonly runUnitImport: Pick<RunDevelopmentUnitImport, 'execute'>;
  readonly opportunities: OpportunityJobs;
  /**
   * El reparto automático de las consultas que entran: por las chances del emprendimiento (#7) y,
   * con el flag, por las reglas (#10). Sin él, quedan pendientes.
   */
  readonly routeInquiry?: Pick<RouteInquiry, 'execute'>;
  readonly actor: Actor;
  /** El de las importaciones: los contactos y las unidades quedan creados por `system:import`. */
  readonly importActor: Actor;
  /** El que crea la propiedad de una tasación convertida: pide un código de la numeración. */
  readonly conversionActor: Actor;
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
    ...appraisalSubscriptions(deps.appraisals, deps, deps.logger),
    ...activitySubscriptions(deps.recordActivity, deps.actor, deps.logger),
    ...erasureSubscriptions(deps.erasure, deps.actor, deps.logger),
    ...mergeSubscriptions(deps.merge, deps.actor, deps.logger),
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
    {
      eventType: 'properties.unit_import_requested',
      name: 'run-unit-import',
      handle: async (event) => {
        const { importId } = ImportPayloadSchema.parse(event.payload);
        const result = await deps.runUnitImport.execute({ importId }, deps.importActor);
        if (result.isErr()) {
          deps.logger.error({ eventId: event.id, error: result.error }, 'Unit import skipped');
        }
      },
    },
    ...(deps.routeInquiry
      ? [routeInquirySubscription(deps.routeInquiry, deps.actor, deps.logger)]
      : []),
  ];
}

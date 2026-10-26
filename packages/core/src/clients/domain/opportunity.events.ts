import type { DomainEvent } from '../../shared/domain/domain-event';

import type { OpportunityStatus } from './opportunity-status';

interface OpportunityPayload {
  readonly opportunityId: string;
  readonly clientId: string;
}

export type OpportunityCreated = DomainEvent<'clients.opportunity_created', OpportunityPayload>;

/** El cliente volvió a consultar por una oportunidad abierta (el asesor tiene que enterarse). */
export type OpportunityRequestAdded = DomainEvent<
  'clients.opportunity_request_added',
  OpportunityPayload
>;

/** Cambió de estado. Si se cerró, trae el motivo. */
export type OpportunityStatusChanged = DomainEvent<
  'clients.opportunity_status_changed',
  OpportunityPayload & {
    readonly from: OpportunityStatus;
    readonly to: OpportunityStatus;
    readonly fromStageId: string | undefined;
    readonly toStageId: string;
    readonly closeReasonId: string | undefined;
  }
>;

/**
 * Pasó a otro agente (o quedó sin agente). Dispara la regla "al asignar" (#9, etapa 4) y la
 * notificación. `assignedBy` e `inquiryId` faltan en los eventos de antes de las notificaciones.
 */
export type OpportunityReassigned = DomainEvent<
  'clients.opportunity_reassigned',
  OpportunityPayload & {
    readonly fromAgentId: string | undefined;
    readonly toAgentId: string | undefined;
    readonly assignedBy: string;
    readonly inquiryId: string | undefined;
  }
>;

/** Se le destacaron propiedades al cliente. Dispara la regla "al reactivar" (#11). */
export type OpportunityListingsFeatured = DomainEvent<
  'clients.opportunity_listings_featured',
  OpportunityPayload & { readonly propertyIds: readonly string[] }
>;

/**
 * Vino de otro sistema (la migración de Tokko, #17) ya en su estado: no es una consulta nueva, así
 * que no avisa al equipo, no aplica reglas ni suma actividad.
 */
export type OpportunityImported = DomainEvent<
  'clients.opportunity_imported',
  OpportunityPayload & { readonly status: OpportunityStatus }
>;

export type OpportunityEvent =
  | OpportunityCreated
  | OpportunityImported
  | OpportunityRequestAdded
  | OpportunityStatusChanged
  | OpportunityReassigned
  | OpportunityListingsFeatured;

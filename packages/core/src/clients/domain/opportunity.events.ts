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

export type OpportunityStatusChanged = DomainEvent<
  'clients.opportunity_status_changed',
  OpportunityPayload & { readonly from: OpportunityStatus; readonly to: OpportunityStatus }
>;

export type OpportunityEvent =
  OpportunityCreated | OpportunityRequestAdded | OpportunityStatusChanged;

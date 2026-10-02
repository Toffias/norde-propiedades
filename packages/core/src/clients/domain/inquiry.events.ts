import type { DomainEvent } from '../../shared/domain/domain-event';

import type { ContactChannel } from './contact-channel';

/** Entró una consulta nueva: la toman el reparto automático y los avisos. */
export type InquiryReceived = DomainEvent<
  'clients.inquiry_received',
  {
    readonly inquiryId: string;
    readonly channel: ContactChannel;
    readonly propertyId: string | undefined;
    readonly developmentId: string | undefined;
  }
>;

export type InquiryDeleted = DomainEvent<'clients.inquiry_deleted', { readonly inquiryId: string }>;

export type InquiryRestored = DomainEvent<
  'clients.inquiry_restored',
  { readonly inquiryId: string }
>;

/** Quedó asignada a un cliente: la oportunidad y su agente ya tienen sus propios eventos. */
export type InquiryAssigned = DomainEvent<
  'clients.inquiry_assigned',
  {
    readonly inquiryId: string;
    readonly clientId: string;
    readonly opportunityId: string;
    readonly agentId: string | undefined;
  }
>;

export type InquiryEvent = InquiryReceived | InquiryDeleted | InquiryRestored | InquiryAssigned;

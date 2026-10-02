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

export type InquiryEvent = InquiryReceived | InquiryDeleted | InquiryRestored;

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts/pagination';

import type { ClientListingSummary } from './clients-activity';
import type { ClientUserRef } from './clients-panel';
import { CONTACT_CHANNEL_VALUES, type ContactChannelValue } from './contact-channels';

// ---------- Ingesta ----------

/** Largo máximo del mensaje de una consulta: lo que exceda lo corta el canal. */
export const MAX_INQUIRY_MESSAGE_LENGTH = 5000;

export const ReceiveInquiryInputSchema = z.object({
  channel: z.enum(CONTACT_CHANNEL_VALUES),
  /** ID de la consulta en el canal (el del portal, o el que genera la web por envío). */
  externalId: z.string().trim().min(1).max(200),
  /** Cuándo la recibió el canal; sin fecha, ahora. */
  receivedAt: z.coerce.date().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  message: z.string().trim().min(1).max(MAX_INQUIRY_MESSAGE_LENGTH).optional(),
  propertyId: z.uuid().optional(),
  developmentId: z.uuid().optional(),
});
export type ReceiveInquiryInput = z.input<typeof ReceiveInquiryInputSchema>;

export interface ReceiveInquiryOutput {
  readonly inquiryId: string;
  /** Ya había entrado (mismo canal e ID externo): no se creó otra. */
  readonly duplicate: boolean;
}

export const InquiryIdInputSchema = z.object({ inquiryId: z.uuid() });
export type InquiryIdInput = z.input<typeof InquiryIdInputSchema>;

// ---------- Bandeja ----------

/** Replica `INQUIRY_STATUSES` del dominio: las pestañas de la bandeja. */
export const INQUIRY_TAB_VALUES = ['pending', 'assigned', 'deleted'] as const;
export type InquiryTabValue = (typeof INQUIRY_TAB_VALUES)[number];

/** Replica `INQUIRY_TAG_KINDS` del dominio. */
export const INQUIRY_TAG_KIND_VALUES = ['channel', 'operation', 'type', 'neighborhood'] as const;
export type InquiryTagKindValue = (typeof INQUIRY_TAG_KIND_VALUES)[number];

export const INQUIRY_SORT_FIELDS = ['receivedAt'] as const;

export const ListInquiriesQuerySchema = pageQuerySchema({
  sortable: INQUIRY_SORT_FIELDS,
  defaultSort: { field: 'receivedAt', direction: 'desc' },
})
  .extend({
    tab: z.enum(INQUIRY_TAB_VALUES).default('pending'),
    branchId: z.uuid().optional(),
    channel: z.enum(CONTACT_CHANNEL_VALUES).optional(),
    propertyId: z.uuid().optional(),
    /** Fechas `AAAA-MM-DD` de Buenos Aires, inclusive. */
    receivedFrom: z.iso.date().optional(),
    receivedTo: z.iso.date().optional(),
  })
  .refine(
    (query) =>
      query.receivedFrom === undefined ||
      query.receivedTo === undefined ||
      // Las fechas ISO se comparan bien como texto.
      query.receivedFrom <= query.receivedTo,
    { message: 'La fecha "desde" es posterior a "hasta".', path: ['receivedTo'] },
  );
export type ListInquiriesQuery = z.input<typeof ListInquiriesQuerySchema>;

export interface InquiryTag {
  readonly kind: InquiryTagKindValue;
  readonly value: string;
}

export interface InquiryBranchRef {
  readonly id: string;
  /** `undefined` si la sucursal ya no existe. */
  readonly name: string | undefined;
}

/** Una tarjeta de la bandeja. */
export interface InquiryInboxRow {
  readonly id: string;
  readonly channel: ContactChannelValue;
  readonly status: InquiryTabValue;
  readonly receivedAt: Date;
  readonly senderName: string | undefined;
  readonly senderEmail: string | undefined;
  /** E.164. */
  readonly senderPhone: string | undefined;
  readonly message: string | undefined;
  readonly tags: readonly InquiryTag[];
  readonly propertyId: string | undefined;
  /** `undefined` si no consultó por una propiedad o ya no está en la cartera. */
  readonly property: ClientListingSummary | undefined;
  readonly branch: InquiryBranchRef | undefined;
  readonly clientId: string | undefined;
  readonly assignedAgent: ClientUserRef | undefined;
  readonly assignedAt: Date | undefined;
  /** Solo en "Borradas". */
  readonly deletedAt: Date | undefined;
  readonly deletedBy: ClientUserRef | undefined;
}

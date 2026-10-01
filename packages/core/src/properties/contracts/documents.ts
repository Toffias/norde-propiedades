// Contracts de los PDF de la ficha (#6): ficha, vidriera y reporte al propietario.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

export const PROPERTY_DOCUMENT_KIND_VALUES = ['sheet', 'showcase', 'owner_report'] as const;
export type PropertyDocumentKindValue = (typeof PROPERTY_DOCUMENT_KIND_VALUES)[number];

export const PROPERTY_DOCUMENT_STATUS_VALUES = ['pending', 'ready', 'failed'] as const;
export type PropertyDocumentStatusValue = (typeof PROPERTY_DOCUMENT_STATUS_VALUES)[number];

const Day = z.iso.date();

export const RequestPropertyDocumentInputSchema = z
  .discriminatedUnion('kind', [
    z.object({ propertyId: z.uuid(), kind: z.literal('sheet') }),
    z.object({ propertyId: z.uuid(), kind: z.literal('showcase') }),
    z.object({ propertyId: z.uuid(), kind: z.literal('owner_report'), from: Day, to: Day }),
  ])
  .refine((input) => input.kind !== 'owner_report' || input.from <= input.to, {
    message: 'La fecha de inicio tiene que ser anterior a la de fin.',
    path: ['to'],
  });
export type RequestPropertyDocumentInput = z.input<typeof RequestPropertyDocumentInputSchema>;

export const DocumentIdInputSchema = z.object({ documentId: z.uuid() });
export type DocumentIdInput = z.input<typeof DocumentIdInputSchema>;

export const SendOwnerReportInputSchema = z.object({
  documentId: z.uuid(),
  /** El email del propietario. No queda en el historial: es un dato personal. */
  to: z.email('Ingresá un email válido.').max(200),
  message: z.string().trim().max(2000).optional(),
});
export type SendOwnerReportInput = z.input<typeof SendOwnerReportInputSchema>;

export const ListPropertyDocumentsQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({ propertyId: z.uuid() });
export type ListPropertyDocumentsQuery = z.input<typeof ListPropertyDocumentsQuerySchema>;

export interface PropertyDocumentRow {
  readonly id: string;
  readonly kind: PropertyDocumentKindValue;
  readonly status: PropertyDocumentStatusValue;
  readonly period: { readonly from: string; readonly to: string } | undefined;
  readonly error: string | undefined;
  readonly requestedBy: { readonly id: string; readonly name: string | undefined };
  readonly createdAt: Date;
}

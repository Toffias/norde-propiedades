// Contracts de los PDF de la ficha (#6): ficha, vidriera y reporte al propietario.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

export const PROPERTY_DOCUMENT_KIND_VALUES = ['sheet', 'showcase', 'owner_report'] as const;
export type PropertyDocumentKindValue = (typeof PROPERTY_DOCUMENT_KIND_VALUES)[number];

export const PROPERTY_DOCUMENT_STATUS_VALUES = ['pending', 'ready', 'failed'] as const;
export type PropertyDocumentStatusValue = (typeof PROPERTY_DOCUMENT_STATUS_VALUES)[number];

const Day = z.iso.date();

/**
 * Los formatos de la ficha (#175), los mismos del "Exportar a PDF" de Tokko: horizontal (una hoja
 * por propiedad), horizontal con mapa, vertical (varias hojas), vertical con mapa y grilla.
 */
export const PROPERTY_SHEET_LAYOUT_VALUES = [
  'landscape',
  'landscape_map',
  'portrait',
  'portrait_map',
  'grid',
] as const;
export type PropertySheetLayoutValue = (typeof PROPERTY_SHEET_LAYOUT_VALUES)[number];

/** La grilla compara varias propiedades: la ficha de una sola no la ofrece. */
export const SINGLE_PROPERTY_SHEET_LAYOUT_VALUES = [
  'landscape',
  'landscape_map',
  'portrait',
  'portrait_map',
] as const satisfies readonly PropertySheetLayoutValue[];

/** Datos del agente: solo cuenta si "Ficha y PDF" pide preguntar al armar el PDF. */
const IncludeAgentSchema = z.boolean().optional();

export const RequestPropertyDocumentInputSchema = z
  .discriminatedUnion('kind', [
    z.object({
      propertyId: z.uuid(),
      kind: z.literal('sheet'),
      layout: z.enum(SINGLE_PROPERTY_SHEET_LAYOUT_VALUES).default('portrait'),
      includeAgent: IncludeAgentSchema,
    }),
    z.object({
      propertyId: z.uuid(),
      kind: z.literal('showcase'),
      includeAgent: IncludeAgentSchema,
    }),
    z.object({
      propertyId: z.uuid(),
      kind: z.literal('owner_report'),
      from: Day,
      to: Day,
      includeAgent: IncludeAgentSchema,
    }),
  ])
  .refine((input) => input.kind !== 'owner_report' || input.from <= input.to, {
    message: 'La fecha de inicio tiene que ser anterior a la de fin.',
    path: ['to'],
  });
export type RequestPropertyDocumentInput = z.input<typeof RequestPropertyDocumentInputSchema>;

export const DocumentIdInputSchema = z.object({ documentId: z.uuid() });
export type DocumentIdInput = z.input<typeof DocumentIdInputSchema>;

/** Lo que el diálogo de exportar necesita saber de "Ficha y PDF". */
export interface PdfExportOptions {
  /** Mi empresa pide preguntar si van los datos del agente. */
  readonly askAgent: boolean;
}

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
  /** El formato de la ficha; los demás PDF no tienen. */
  readonly layout: PropertySheetLayoutValue | undefined;
  readonly error: string | undefined;
  readonly requestedBy: { readonly id: string; readonly name: string | undefined };
  readonly createdAt: Date;
}

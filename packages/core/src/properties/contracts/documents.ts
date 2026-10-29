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

/** El PDF de vidriera: vertical u horizontal (#175). */
export const SHOWCASE_ORIENTATION_VALUES = ['portrait', 'landscape'] as const;
export type ShowcaseOrientationValue = (typeof SHOWCASE_ORIENTATION_VALUES)[number];

/** Cuántas fotos lleva la vidriera. */
export const SHOWCASE_PHOTO_COUNT_VALUES = [1, 3] as const;
export type ShowcasePhotoCountValue = (typeof SHOWCASE_PHOTO_COUNT_VALUES)[number];

/** El tamaño de letra de la descripción, en la escala de Tokko. */
export const SHOWCASE_DESCRIPTION_SIZE_RANGE = { min: 30, max: 50 } as const;

/** Lo que trae el diálogo si nunca se tocó: los colores de la marca, QR, banda y 3 fotos. */
export const SHOWCASE_OPTION_DEFAULTS = {
  orientation: 'portrait',
  primaryColor: '#c9302b',
  secondaryColor: '#2a2522',
  qr: true,
  operationBand: true,
  photoCount: 3,
  photoIds: [],
  descriptionSize: 40,
} as const satisfies {
  readonly orientation: ShowcaseOrientationValue;
  readonly photoCount: ShowcasePhotoCountValue;
  readonly [option: string]: unknown;
};

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Elegí un color.');

export const ShowcaseOptionsInputSchema = z.object({
  orientation: z.enum(SHOWCASE_ORIENTATION_VALUES).default(SHOWCASE_OPTION_DEFAULTS.orientation),
  primaryColor: HexColor.default(SHOWCASE_OPTION_DEFAULTS.primaryColor),
  secondaryColor: HexColor.default(SHOWCASE_OPTION_DEFAULTS.secondaryColor),
  qr: z.boolean().default(SHOWCASE_OPTION_DEFAULTS.qr),
  operationBand: z.boolean().default(SHOWCASE_OPTION_DEFAULTS.operationBand),
  photoCount: z.union([z.literal(1), z.literal(3)]).default(SHOWCASE_OPTION_DEFAULTS.photoCount),
  /** Las fotos elegidas, en orden; las que falten se completan con las de la ficha. */
  photoIds: z.array(z.uuid()).max(3).default([]),
  descriptionSize: z
    .number()
    .int()
    .min(SHOWCASE_DESCRIPTION_SIZE_RANGE.min)
    .max(SHOWCASE_DESCRIPTION_SIZE_RANGE.max)
    .default(SHOWCASE_OPTION_DEFAULTS.descriptionSize),
});
export type ShowcaseOptionsInput = z.input<typeof ShowcaseOptionsInputSchema>;

/** Qué lleva el reporte al propietario además del movimiento: publicaciones y estadísticas. */
export const OwnerReportOptionsInputSchema = z.object({
  publications: z.boolean().default(true),
  statistics: z.boolean().default(true),
});
export type OwnerReportOptionsInput = z.input<typeof OwnerReportOptionsInputSchema>;

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
      options: ShowcaseOptionsInputSchema.optional(),
      includeAgent: IncludeAgentSchema,
    }),
    z.object({
      propertyId: z.uuid(),
      kind: z.literal('owner_report'),
      from: Day,
      to: Day,
      options: OwnerReportOptionsInputSchema.optional(),
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
  /** La vidriera: vertical u horizontal. */
  readonly orientation: ShowcaseOrientationValue | undefined;
  readonly error: string | undefined;
  readonly requestedBy: { readonly id: string; readonly name: string | undefined };
  readonly createdAt: Date;
}

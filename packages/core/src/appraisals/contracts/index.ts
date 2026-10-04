// Contracts del módulo appraisals (`@norde/core/appraisals/contracts`): importables desde el cliente.

import { z } from 'zod';

import { historyQuerySchema } from '../../audit/contracts';
import {
  CONDITION_VALUES,
  PROPERTY_TYPES,
  type ConditionValue,
  type PropertyType,
} from '../../properties/contracts';
import { pageQuerySchema } from '../../shared/contracts';

// Los catálogos que la tasación comparte con la propiedad a la que se convierte.
export { CONDITION_VALUES, PROPERTY_TYPES, type ConditionValue, type PropertyType };

/** Replica `APPRAISAL_STATUSES` del dominio. */
export const APPRAISAL_STATUS_VALUES = [
  'requested',
  'visit_scheduled',
  'appraised',
  'converted',
  'discarded',
] as const;
export type AppraisalStatusValue = (typeof APPRAISAL_STATUS_VALUES)[number];

/** Los que se eligen a mano: "Convertida" la marca la conversión en propiedad. */
export const MANUAL_APPRAISAL_STATUS_VALUES = [
  'requested',
  'visit_scheduled',
  'appraised',
  'discarded',
] as const satisfies readonly AppraisalStatusValue[];

/** Replica `APPRAISAL_STATUS_GROUPS` del dominio: los estados como los agrupa Tokko. */
export const APPRAISAL_STATUS_GROUP_VALUES = [
  'pending',
  'appraised',
  'discarded',
  'converted',
] as const;
export type AppraisalStatusGroupValue = (typeof APPRAISAL_STATUS_GROUP_VALUES)[number];

/** Replica `APPRAISAL_SOURCES` del dominio. */
export const APPRAISAL_SOURCE_VALUES = ['manual', 'agent_ia', 'web'] as const;
export type AppraisalSourceValue = (typeof APPRAISAL_SOURCE_VALUES)[number];

export const APPRAISAL_VIEW_VALUES = ['active', 'trash'] as const;
export type AppraisalViewValue = (typeof APPRAISAL_VIEW_VALUES)[number];

export const MAX_APPRAISAL_ADDRESS_LENGTH = 200;

/** Cantidades enteras (ambientes, dormitorios, baños): vacío es "sin dato". */
const OptionalCount = z.coerce.number().int('Ingresá un número entero.').min(0).max(999).optional();

function hasTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-9;
}

/** Metros con hasta dos decimales. */
const OptionalMeters = z.coerce
  .number()
  .min(0)
  .max(10_000_000)
  .refine(hasTwoDecimals, { message: 'Usá hasta dos decimales.' })
  .optional();

/** Lo que se carga y se edita de una tasación. */
const appraisalFields = {
  requesterClientId: z.uuid('Elegí el contacto que pide la tasación.'),
  /** Sin productor: queda quien la carga. */
  producerUserId: z.uuid().optional(),
  appraiserUserId: z.uuid().optional(),
  /** Día y hora de la visita en Buenos Aires (`AAAA-MM-DDTHH:mm`). */
  visitAt: z.iso.datetime({ local: true, message: 'Ingresá una fecha y hora válidas.' }).optional(),
  propertyType: z.enum(PROPERTY_TYPES, 'Elegí el tipo de propiedad.'),
  address: z.string().trim().max(MAX_APPRAISAL_ADDRESS_LENGTH).optional(),
  surfaceTotalM2: OptionalMeters,
  surfaceCoveredM2: OptionalMeters,
  rooms: OptionalCount,
  bedrooms: OptionalCount,
  bathrooms: OptionalCount,
  condition: z.enum(CONDITION_VALUES).optional(),
};

export const CreateAppraisalInputSchema = z.object(appraisalFields);
export type CreateAppraisalInput = z.input<typeof CreateAppraisalInputSchema>;
export type CreateAppraisalValues = z.output<typeof CreateAppraisalInputSchema>;

export const UpdateAppraisalInputSchema = z.object({
  appraisalId: z.uuid(),
  ...appraisalFields,
});
export type UpdateAppraisalInput = z.input<typeof UpdateAppraisalInputSchema>;

export const ChangeAppraisalStatusInputSchema = z.object({
  appraisalId: z.uuid(),
  status: z.enum(MANUAL_APPRAISAL_STATUS_VALUES),
});
export type ChangeAppraisalStatusInput = z.input<typeof ChangeAppraisalStatusInputSchema>;

export const AppraisalIdInputSchema = z.object({ appraisalId: z.uuid() });
export type AppraisalIdInput = z.input<typeof AppraisalIdInputSchema>;

// ---------- Listado (/tasaciones) ----------

export const APPRAISAL_SORT_FIELDS = ['createdAt', 'visitAt', 'code'] as const;
export type AppraisalSortField = (typeof APPRAISAL_SORT_FIELDS)[number];

function checkDateRanges(
  query: {
    readonly createdFrom?: string | undefined;
    readonly createdTo?: string | undefined;
    readonly visitFrom?: string | undefined;
    readonly visitTo?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  // Las fechas ISO se comparan bien como texto.
  for (const [from, to] of [
    ['createdFrom', 'createdTo'],
    ['visitFrom', 'visitTo'],
  ] as const) {
    const start = query[from];
    const end = query[to];
    if (start !== undefined && end !== undefined && start > end) {
      ctx.addIssue({
        code: 'custom',
        message: 'La fecha "desde" es posterior a "hasta".',
        path: [to],
      });
    }
  }
}

/** Todas las tasaciones que el usuario puede ver, con filtros, paginadas en la base. */
export const ListAppraisalsQuerySchema = pageQuerySchema({
  sortable: APPRAISAL_SORT_FIELDS,
  defaultSort: { field: 'createdAt', direction: 'desc' },
})
  .extend({
    view: z.enum(APPRAISAL_VIEW_VALUES).default('active'),
    /** Estado agrupado como en Tokko: Pendiente, Tasado, Caída, Ingresada. */
    status: z.enum(APPRAISAL_STATUS_GROUP_VALUES).optional(),
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    producerId: z.uuid().optional(),
    appraiserId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    /** Fechas `AAAA-MM-DD` de Buenos Aires, inclusive. */
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    visitFrom: z.iso.date().optional(),
    visitTo: z.iso.date().optional(),
  })
  .superRefine(checkDateRanges);
export type ListAppraisalsQuery = z.input<typeof ListAppraisalsQuerySchema>;

/** Un usuario o una sucursal: `name` es `undefined` si ya no está activo. */
export interface AppraisalRef {
  readonly id: string;
  readonly name: string | undefined;
}

/** Una tasación del listado. */
export interface AppraisalListRow {
  readonly id: string;
  readonly code: string;
  readonly status: AppraisalStatusValue;
  readonly propertyType: PropertyType;
  readonly address: string | undefined;
  /** `name` es `undefined` si el contacto ya no está (papelera o supresión). */
  readonly requester: { readonly id: string; readonly name: string | undefined };
  readonly producer: AppraisalRef;
  readonly appraiser: AppraisalRef | undefined;
  readonly branch: AppraisalRef | undefined;
  readonly visitAt: Date | undefined;
  readonly createdAt: Date;
  readonly deletedAt: Date | undefined;
}

// ---------- Ficha (/tasaciones/[id]) ----------

/** La tasación completa, para su ficha. */
export interface AppraisalDetail extends AppraisalListRow {
  readonly source: AppraisalSourceValue;
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
  readonly rooms: number | undefined;
  readonly bedrooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly condition: ConditionValue | undefined;
  readonly statusChangedAt: Date | undefined;
  readonly updatedAt: Date;
}

export const ListAppraisalHistoryQuerySchema = historyQuerySchema().extend({
  appraisalId: z.uuid(),
});
export type ListAppraisalHistoryQuery = z.input<typeof ListAppraisalHistoryQuerySchema>;

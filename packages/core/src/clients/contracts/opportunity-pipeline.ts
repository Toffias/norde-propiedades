// Pipeline de oportunidades (#9, etapa 2): listado por estado, contadores y acciones individuales.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import { OPPORTUNITY_STATUS_VALUES, type OpportunityStatusValue } from './clients-activity';
import type { ClientKindValue, ClientUserRef } from './clients-panel';
import { CONTACT_CHANNEL_VALUES } from './contact-channels';

export const OPPORTUNITY_SORT_FIELDS = [
  'updatedAt',
  'statusChangedAt',
  'createdAt',
  'clientName',
] as const;
export type OpportunitySortField = (typeof OPPORTUNITY_SORT_FIELDS)[number];

export const OPPORTUNITY_SORT_LABELS: Readonly<Record<OpportunitySortField, string>> = {
  updatedAt: 'Última actualización',
  statusChangedAt: 'Vigencia',
  createdAt: 'Creación',
  clientName: 'Contacto',
};

/** Filtros del pipeline: los comparten las secciones y los contadores. */
const OpportunityFilterFields = {
  /** Nombre, teléfono, email o documento del contacto, sin distinguir mayúsculas ni acentos. */
  q: z.string().trim().min(1).max(100).optional(),
  /** Agente de la oportunidad (no el del contacto). */
  agentId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  /** Etiqueta del contacto. */
  tagId: z.uuid().optional(),
  originChannel: z.enum(CONTACT_CHANNEL_VALUES).optional(),
  category: z.enum(OPPORTUNITY_STATUS_VALUES).optional(),
  /** Fechas `AAAA-MM-DD` de Buenos Aires, inclusive. */
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  updatedFrom: z.iso.date().optional(),
  updatedTo: z.iso.date().optional(),
};

function checkDateRanges(
  query: {
    readonly createdFrom?: string | undefined;
    readonly createdTo?: string | undefined;
    readonly updatedFrom?: string | undefined;
    readonly updatedTo?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  // Las fechas ISO se comparan bien como texto.
  for (const [from, to] of [
    ['createdFrom', 'createdTo'],
    ['updatedFrom', 'updatedTo'],
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

export const OpportunityFilterSchema = z
  .object(OpportunityFilterFields)
  .superRefine(checkDateRanges);
export type OpportunityFilter = z.input<typeof OpportunityFilterSchema>;

/** Una sección del pipeline: las oportunidades de un estado, paginadas. */
export const ListOpportunitiesQuerySchema = pageQuerySchema({
  sortable: OPPORTUNITY_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
  .extend({ ...OpportunityFilterFields, stageId: z.uuid() })
  .superRefine(checkDateRanges);
export type ListOpportunitiesQuery = z.input<typeof ListOpportunitiesQuerySchema>;

/** Cuántas oportunidades cumplen los filtros en un estado. Solo los que tienen alguna. */
export interface OpportunityStageCount {
  readonly stageId: string;
  readonly count: number;
}

export interface OpportunityPipelineClient {
  readonly id: string;
  readonly kind: ClientKindValue;
  readonly name: string | undefined;
  /** El primer celular, o si no tiene, el primer teléfono. Enmascarado si `contactMasked`. */
  readonly phone: string | undefined;
  /** Es propietario y el actor no puede ver sus datos. */
  readonly contactMasked: boolean;
}

/** La propiedad por la que consultó, del módulo properties. */
export interface OpportunityPipelineProperty {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

/** Qué puede hacer el actor con una oportunidad. Las listas las resuelve el dominio. */
export interface OpportunityActions {
  /** Cambiar el estado y cerrar (es suya, o puede con las de otros). */
  readonly update: boolean;
  readonly reassign: boolean;
  /** Los estados a los que puede pasar sin cerrar, en el orden del pipeline. */
  readonly moveTo: readonly string[];
  /** Los motivos con los que se puede cerrar desde su estado actual. */
  readonly closeWith: readonly string[];
}

/** Fila de una sección del pipeline. */
export interface OpportunityPipelineRow {
  readonly id: string;
  readonly client: OpportunityPipelineClient;
  readonly type: string;
  readonly intent: string;
  readonly originChannel: string;
  readonly status: OpportunityStatusValue;
  readonly stageId: string;
  readonly open: boolean;
  readonly propertyId: string | undefined;
  /** `undefined` si no consultó por una propiedad, o si el actor no la ve. */
  readonly property: OpportunityPipelineProperty | undefined;
  readonly agent: ClientUserRef | undefined;
  /** Desde cuándo está en el estado actual, y cuántos días completos van (vigencia). */
  readonly statusChangedAt: Date;
  readonly daysInStage: number;
  /** La última nota del contacto, recortada. */
  readonly lastNote: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly can: OpportunityActions;
}

// ---------- Acciones ----------

export const ChangeOpportunityStageInputSchema = z.object({
  opportunityId: z.uuid(),
  stageId: z.uuid(),
});
export type ChangeOpportunityStageInput = z.input<typeof ChangeOpportunityStageInputSchema>;

export const CloseOpportunityInputSchema = z.object({
  opportunityId: z.uuid(),
  closeReasonId: z.uuid({ error: 'Elegí un motivo.' }),
  /** Sin estado: el primero activo de la categoría que corresponde al motivo. */
  stageId: z.uuid().optional(),
});
export type CloseOpportunityInput = z.input<typeof CloseOpportunityInputSchema>;

export const ReassignOpportunityInputSchema = z.object({
  opportunityId: z.uuid(),
  /** `null`: queda sin agente. */
  agentId: z.uuid().nullable(),
});
export type ReassignOpportunityInput = z.input<typeof ReassignOpportunityInputSchema>;

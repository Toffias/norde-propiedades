// Acciones masivas sobre oportunidades y derivación a socias (#9, etapa 4).

import { z } from 'zod';

import { bulkSelectionSchema } from '../../shared/contracts';

import { OpportunityFilterFields, checkDateRanges } from './opportunity-pipeline';

/** Replica `BULK_SYNC_LIMIT` y `MAX_BULK_OPPORTUNITIES` del dominio. */
export const OPPORTUNITY_BULK_SYNC_LIMIT = 100;
export const MAX_BULK_OPPORTUNITIES = 2000;

/** El filtro de "todas las que cumplen": el del pipeline, y opcionalmente un estado (la sección). */
export const OpportunityBulkFilterSchema = z
  .object({ ...OpportunityFilterFields, stageId: z.uuid().optional() })
  .superRefine(checkDateRanges);
export type OpportunityBulkFilter = z.input<typeof OpportunityBulkFilterSchema>;

export const OpportunitySelectionSchema = bulkSelectionSchema(OpportunityBulkFilterSchema);
export type OpportunitySelection = z.input<typeof OpportunitySelectionSchema>;

export const OpportunityBulkActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('change_stage'), stageId: z.uuid({ error: 'Elegí un estado.' }) }),
  z.object({ kind: z.literal('close'), closeReasonId: z.uuid({ error: 'Elegí un motivo.' }) }),
  /** `null`: quedan sin agente. */
  z.object({ kind: z.literal('reassign'), agentId: z.uuid().nullable() }),
]);
export type OpportunityBulkActionInput = z.input<typeof OpportunityBulkActionSchema>;

export const BulkUpdateOpportunitiesInputSchema = z.object({
  selection: OpportunitySelectionSchema,
  action: OpportunityBulkActionSchema,
});
export type BulkUpdateOpportunitiesInput = z.input<typeof BulkUpdateOpportunitiesInputSchema>;

/** Replica `OPPORTUNITY_BULK_SKIP_REASONS` del dominio. */
export const OPPORTUNITY_BULK_SKIP_REASON_VALUES = [
  'not_found',
  'forbidden',
  'closed',
  'invalid_transition',
] as const;
export type OpportunityBulkSkipReasonValue = (typeof OPPORTUNITY_BULK_SKIP_REASON_VALUES)[number];

export const OPPORTUNITY_BULK_SKIP_REASON_LABELS: Readonly<
  Record<OpportunityBulkSkipReasonValue, string>
> = {
  not_found: 'Ya no está o no la ves',
  forbidden: 'No tenés permiso sobre ella',
  closed: 'Está cerrada',
  invalid_transition: 'No puede pasar a ese estado desde el que tiene',
};

export interface OpportunityBulkResult {
  readonly total: number;
  readonly processed: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skippedCount: number;
  /** Las primeras que no se pudieron cambiar, con el motivo. */
  readonly skipped: readonly {
    readonly opportunityId: string;
    readonly reason: OpportunityBulkSkipReasonValue;
  }[];
}

/** Hecha en el request, o encolada como job (se sigue con `GetOpportunityBulkOperation`). */
export type BulkUpdateOpportunitiesOutput =
  | { readonly mode: 'done'; readonly result: OpportunityBulkResult }
  | { readonly mode: 'queued'; readonly operationId: string; readonly total: number };

/** Replica `OPPORTUNITY_BULK_STATUSES` del dominio. */
export const OPPORTUNITY_BULK_STATUS_VALUES = ['pending', 'running', 'done', 'failed'] as const;
export type OpportunityBulkStatusValue = (typeof OPPORTUNITY_BULK_STATUS_VALUES)[number];

export const GetOpportunityBulkOperationInputSchema = z.object({ operationId: z.uuid() });
export type GetOpportunityBulkOperationInput = z.input<
  typeof GetOpportunityBulkOperationInputSchema
>;

export interface OpportunityBulkOperationView {
  readonly id: string;
  readonly status: OpportunityBulkStatusValue;
  readonly result: OpportunityBulkResult;
  /** Si falló entera: el usuario ya no está activo, o el pedido dejó de ser válido. */
  readonly failure: 'requester_unavailable' | 'invalid_request' | undefined;
}

// ---------- Derivación a socia ----------

/** Replica `REFERRAL_RESULTS` del dominio. */
export const REFERRAL_RESULT_VALUES = ['referred', 'no_options', 'returned'] as const;
export type ReferralResultValue = (typeof REFERRAL_RESULT_VALUES)[number];

export const REFERRAL_RESULT_LABELS: Readonly<Record<ReferralResultValue, string>> = {
  referred: 'Derivada',
  no_options: 'Sin opciones',
  returned: 'Volvió a Norde',
};

export const MAX_PARTNER_NAME_LENGTH = 120;

export const UpdateOpportunityReferralInputSchema = z.object({
  opportunityId: z.uuid(),
  partnerName: z
    .string()
    .trim()
    .max(MAX_PARTNER_NAME_LENGTH, `Hasta ${MAX_PARTNER_NAME_LENGTH} caracteres.`)
    .nullable(),
  /** `AAAA-MM-DD`. */
  referredAt: z.iso.date({ error: 'Elegí una fecha válida.' }).nullable(),
  result: z.enum(REFERRAL_RESULT_VALUES).nullable(),
});
export type UpdateOpportunityReferralInput = z.input<typeof UpdateOpportunityReferralInputSchema>;

/** Lo que se cargó de la derivación (en las filas de "Aplica a otra inmobiliaria"). */
export interface OpportunityReferralView {
  readonly partnerName: string | undefined;
  /** `AAAA-MM-DD`. */
  readonly referredAt: string | undefined;
  readonly result: ReferralResultValue | undefined;
}

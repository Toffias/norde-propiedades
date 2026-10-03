// Configuración de oportunidades (#9): estados editables, motivos de cierre y reglas automáticas.

import { z } from 'zod';

import { OPPORTUNITY_STATUS_VALUES, type OpportunityStatusValue } from './clients-activity';

/** Replica `MAX_OPPORTUNITY_STAGES` del dominio. */
export const MAX_OPPORTUNITY_STAGE_COUNT = 30;
/** Replica `MAX_CLOSE_REASONS` del dominio. */
export const MAX_CLOSE_REASON_COUNT = 50;

/** Replica `CLOSE_REASON_RATINGS` del dominio. */
export const CLOSE_REASON_RATING_VALUES = ['positive', 'negative', 'neutral'] as const;
export type CloseReasonRatingValue = (typeof CLOSE_REASON_RATING_VALUES)[number];

export const CLOSE_REASON_RATING_LABELS: Readonly<Record<CloseReasonRatingValue, string>> = {
  positive: 'Positivo (ganada)',
  negative: 'Negativo (perdida)',
  neutral: 'Neutral (perdida)',
};

/** Replica `OPPORTUNITY_RULES` del dominio. */
export const OPPORTUNITY_RULE_VALUES = [
  'onCreate',
  'onAssign',
  'onReactivate',
  'forOwners',
] as const;
export type OpportunityRuleValue = (typeof OPPORTUNITY_RULE_VALUES)[number];

export const OPPORTUNITY_RULE_LABELS: Readonly<
  Record<OpportunityRuleValue, { readonly label: string; readonly hint: string }>
> = {
  onCreate: {
    label: 'Al crear',
    hint: 'Estado de una oportunidad nueva. Si Norde no tiene qué ofrecerle, nace en "Aplica a otra inmobiliaria".',
  },
  onAssign: {
    label: 'Al asignar a un agente',
    hint: 'Cuando la oportunidad se deriva a otro agente.',
  },
  onReactivate: {
    label: 'Al reactivar',
    hint: 'Cuando una oportunidad derivada a una socia vuelve a consultar o le destacás una propiedad.',
  },
  forOwners: {
    label: 'Para propietarios',
    hint: 'Oportunidades nuevas de contactos que son propietarios.',
  },
};

const Name = z.string().trim().min(1, 'Escribí un nombre.');
const Color = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Elegí un color.');

export const CreateOpportunityStageInputSchema = z.object({
  name: Name.max(40),
  color: Color,
  category: z.enum(OPPORTUNITY_STATUS_VALUES),
});
export type CreateOpportunityStageInput = z.input<typeof CreateOpportunityStageInputSchema>;

/** La categoría no cambia: las oportunidades que tienen el estado la guardan. */
export const UpdateOpportunityStageInputSchema = z.object({
  stageId: z.uuid(),
  name: Name.max(40),
  color: Color,
});
export type UpdateOpportunityStageInput = z.input<typeof UpdateOpportunityStageInputSchema>;

export const OpportunityStageIdInputSchema = z.object({ stageId: z.uuid() });
export type OpportunityStageIdInput = z.input<typeof OpportunityStageIdInputSchema>;

/** El orden completo: todos los estados, una vez cada uno. */
export const ReorderOpportunityStagesInputSchema = z.object({
  stageIds: z.array(z.uuid()).min(1).max(MAX_OPPORTUNITY_STAGE_COUNT),
});
export type ReorderOpportunityStagesInput = z.input<typeof ReorderOpportunityStagesInputSchema>;

export const CreateCloseReasonInputSchema = z.object({
  name: Name.max(80),
  rating: z.enum(CLOSE_REASON_RATING_VALUES),
});
export type CreateCloseReasonInput = z.input<typeof CreateCloseReasonInputSchema>;

export const UpdateCloseReasonInputSchema = CreateCloseReasonInputSchema.extend({
  reasonId: z.uuid(),
});
export type UpdateCloseReasonInput = z.input<typeof UpdateCloseReasonInputSchema>;

export const CloseReasonIdInputSchema = z.object({ reasonId: z.uuid() });
export type CloseReasonIdInput = z.input<typeof CloseReasonIdInputSchema>;

export const ReorderCloseReasonsInputSchema = z.object({
  reasonIds: z.array(z.uuid()).min(1).max(MAX_CLOSE_REASON_COUNT),
});
export type ReorderCloseReasonsInput = z.input<typeof ReorderCloseReasonsInputSchema>;

/** El estado de cada regla; `null`: la regla no hace nada. */
export const UpdateOpportunitySettingsInputSchema = z.object({
  onCreate: z.uuid().nullable(),
  onAssign: z.uuid().nullable(),
  onReactivate: z.uuid().nullable(),
  forOwners: z.uuid().nullable(),
});
export type UpdateOpportunitySettingsInput = z.input<typeof UpdateOpportunitySettingsInputSchema>;

export interface OpportunityStageRow {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly position: number;
  readonly category: OpportunityStatusValue;
  readonly isActive: boolean;
}

export interface CloseReasonRow {
  readonly id: string;
  readonly name: string;
  readonly rating: CloseReasonRatingValue;
  /** La categoría en la que cierra: positivo gana; negativo o neutral pierde (lo decide el dominio). */
  readonly closesAs: OpportunityStatusValue;
  readonly position: number;
  readonly isActive: boolean;
}

export interface OpportunityConfiguration {
  /** Todos los estados (como mucho `MAX_OPPORTUNITY_STAGE_COUNT`), por posición. */
  readonly stages: readonly OpportunityStageRow[];
  /** Todos los motivos (como mucho `MAX_CLOSE_REASON_COUNT`), por posición. */
  readonly closeReasons: readonly CloseReasonRow[];
  readonly rules: Readonly<Record<OpportunityRuleValue, string | null>>;
}

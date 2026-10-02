import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts/pagination';

import type { ClientListingSummary } from './clients-activity';
import type { ClientUserRef } from './clients-panel';
import { CONTACT_CHANNEL_VALUES, type ContactChannelValue } from './contact-channels';

// Las reglas de asignación automática de consultas (#10, etapa 3). Los topes replican los del
// dominio (`inquiry-assignment-rule.ts`, `weighted-distribution.ts`); un test verifica que
// coincidan.

export const MAX_INQUIRY_RULE_VALUES = 50;
export const MAX_INQUIRY_RULE_AGENTS = 20;
export const MIN_INQUIRY_RULE_WEIGHT = 1;
export const MAX_INQUIRY_RULE_WEIGHT = 10;
export const MAX_INQUIRY_RULE_NAME_LENGTH = 80;

const code = z.string().trim().min(1).max(40);
const values = <T extends z.ZodType>(item: T) =>
  z.array(item).max(MAX_INQUIRY_RULE_VALUES).default([]);

export const InquiryRuleConditionsSchema = z.object({
  channels: values(z.enum(CONTACT_CHANNEL_VALUES)),
  /** `sale`, `rent`, `temporary_rent`. */
  operations: values(code),
  /** Códigos de tipo de propiedad del catálogo. */
  propertyTypes: values(code),
  /** La zona: barrios, por nombre. */
  neighborhoods: values(z.string().trim().min(1).max(100)),
  propertyIds: values(z.uuid()),
  developmentIds: values(z.uuid()),
});
export type InquiryRuleConditionsInput = z.input<typeof InquiryRuleConditionsSchema>;

export const InquiryRuleAgentInputSchema = z.object({
  userId: z.uuid(),
  weight: z.int().min(MIN_INQUIRY_RULE_WEIGHT).max(MAX_INQUIRY_RULE_WEIGHT),
});

const ruleFields = {
  name: z.string().trim().min(1, 'Ingresá un nombre.').max(MAX_INQUIRY_RULE_NAME_LENGTH),
  conditions: InquiryRuleConditionsSchema.default({
    channels: [],
    operations: [],
    propertyTypes: [],
    neighborhoods: [],
    propertyIds: [],
    developmentIds: [],
  }),
  agents: z
    .array(InquiryRuleAgentInputSchema)
    .min(1, 'Elegí al menos un agente.')
    .max(MAX_INQUIRY_RULE_AGENTS),
};

export const CreateInquiryRuleInputSchema = z.object(ruleFields);
export type CreateInquiryRuleInput = z.input<typeof CreateInquiryRuleInputSchema>;

export const UpdateInquiryRuleInputSchema = z.object({ ruleId: z.uuid(), ...ruleFields });
export type UpdateInquiryRuleInput = z.input<typeof UpdateInquiryRuleInputSchema>;

export const InquiryRuleIdInputSchema = z.object({ ruleId: z.uuid() });
export type InquiryRuleIdInput = z.input<typeof InquiryRuleIdInputSchema>;

export const SetInquiryRuleActiveInputSchema = z.object({ ruleId: z.uuid(), active: z.boolean() });
export type SetInquiryRuleActiveInput = z.input<typeof SetInquiryRuleActiveInputSchema>;

/** Sube o baja un lugar en la prioridad, entre las de su pestaña (activas o inactivas). */
export const MoveInquiryRuleInputSchema = z.object({
  ruleId: z.uuid(),
  direction: z.enum(['up', 'down']),
});
export type MoveInquiryRuleInput = z.input<typeof MoveInquiryRuleInputSchema>;

export interface CreateInquiryRuleOutput {
  readonly ruleId: string;
}

// ---------- Listado ----------

export const INQUIRY_RULE_STATUS_VALUES = ['active', 'inactive'] as const;
export type InquiryRuleStatusValue = (typeof INQUIRY_RULE_STATUS_VALUES)[number];

/** Por prioridad: es el orden en que se evalúan. */
export const INQUIRY_RULE_SORT_FIELDS = ['priority'] as const;

export const ListInquiryRulesQuerySchema = pageQuerySchema({
  sortable: INQUIRY_RULE_SORT_FIELDS,
  defaultSort: { field: 'priority', direction: 'asc' },
}).extend({ status: z.enum(INQUIRY_RULE_STATUS_VALUES).default('active') });
export type ListInquiryRulesQuery = z.input<typeof ListInquiryRulesQuerySchema>;

export interface InquiryRuleConditionsView {
  readonly channels: readonly ContactChannelValue[];
  readonly operations: readonly string[];
  readonly propertyTypes: readonly string[];
  readonly neighborhoods: readonly string[];
  /** Las que ya no están en la cartera, con `summary` vacío. */
  readonly properties: readonly {
    readonly id: string;
    readonly summary: ClientListingSummary | undefined;
  }[];
  readonly developmentIds: readonly string[];
}

export interface InquiryRuleAgentView {
  readonly user: ClientUserRef;
  readonly weight: number;
  /** Qué parte de las consultas recibe, en %, entre los agentes de la regla. */
  readonly share: number;
}

/** Una regla en el listado y en el asistente de edición. */
export interface InquiryRuleRow {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  /** 1 = la primera que se evalúa (dentro de su pestaña). */
  readonly priority: number;
  readonly conditions: InquiryRuleConditionsView;
  readonly agents: readonly InquiryRuleAgentView[];
  readonly updatedAt: Date;
  /** Si se puede subir o bajar en la prioridad. */
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

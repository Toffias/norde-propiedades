// Ficha completa del contacto (#8, etapa 3): actividad, notas, oportunidades, destacadas,
// búsquedas guardadas y lo que se le ofrece.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import type { ClientUserRef } from './clients-panel';
import type { OpportunityActions } from './opportunity-pipeline';

// ---------- Oportunidades ----------

/** Replica `OPPORTUNITY_STATUSES` del dominio. */
export const OPPORTUNITY_STATUS_VALUES = [
  'new',
  'contacted',
  'visiting',
  'negotiating',
  'won',
  'lost',
  'referred_to_partner',
] as const;
export type OpportunityStatusValue = (typeof OPPORTUNITY_STATUS_VALUES)[number];

export const OPPORTUNITY_STATUS_LABELS: Readonly<Record<OpportunityStatusValue, string>> = {
  new: 'Nueva',
  contacted: 'Contactado',
  visiting: 'Visitando',
  negotiating: 'Negociando',
  won: 'Ganada',
  lost: 'Perdida',
  referred_to_partner: 'Aplica a otra inmobiliaria',
};

export const OPPORTUNITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  sale: 'Compra',
  rent: 'Alquiler',
  appraisal: 'Tasación',
};

export const OPPORTUNITY_INTENT_LABELS: Readonly<Record<string, string>> = {
  info: 'Pidió información',
  contact: 'Pidió que lo contacten',
  visit: 'Pidió una visita',
};

export const ListClientOpportunitiesQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({ clientId: z.uuid() });
export type ListClientOpportunitiesQuery = z.input<typeof ListClientOpportunitiesQuerySchema>;

/** El estado editable de una oportunidad, para su etiqueta (nombre y color). */
export interface OpportunityStageRef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface ClientOpportunityRow {
  readonly id: string;
  readonly type: string;
  readonly intent: string;
  readonly status: OpportunityStatusValue;
  /** `undefined` solo en las anteriores al backfill de estados. */
  readonly stage: OpportunityStageRef | undefined;
  readonly open: boolean;
  readonly originChannel: string;
  /** Propiedad por la que consultó (módulo properties, por ID). */
  readonly propertyId: string | undefined;
  readonly agent: ClientUserRef | undefined;
  readonly createdAt: Date;
  readonly statusChangedAt: Date | undefined;
  readonly closedAt: Date | undefined;
}

/** La oportunidad abierta más reciente, para la tarjeta de la ficha. */
export interface ClientActiveOpportunity {
  readonly id: string;
  readonly type: string;
  readonly status: OpportunityStatusValue;
  readonly stage: OpportunityStageRef | undefined;
  /** El de la oportunidad, que puede no ser el del contacto. */
  readonly agent: ClientUserRef | undefined;
  readonly createdAt: Date;
  /** Cuántas abiertas tiene en total (la tarjeta muestra la más reciente). */
  readonly openCount: number;
  readonly can: OpportunityActions;
}

// ---------- Actividad ----------

/** Replica `CLIENT_ACTIVITY_KINDS` del dominio. */
export const CLIENT_ACTIVITY_KIND_VALUES = [
  'note',
  'status_change',
  'listing_sent',
  'listing_viewed',
  'listing_reaction',
  'inquiry',
  'message',
  'merge',
] as const;
export type ClientActivityKindValue = (typeof CLIENT_ACTIVITY_KIND_VALUES)[number];

export const CLIENT_ACTIVITY_KIND_LABELS: Readonly<Record<ClientActivityKindValue, string>> = {
  note: 'Notas',
  status_change: 'Cambios de estado',
  listing_sent: 'Envíos',
  listing_viewed: 'Propiedades vistas',
  listing_reaction: 'Reacciones',
  inquiry: 'Consultas',
  message: 'Conversaciones del agente de IA',
  merge: 'Unificaciones',
};

/** Largo máximo de una nota. */
export const MAX_CLIENT_NOTE_LENGTH = 5000;

/** Lo que se filtra en el historial de una oportunidad: todo menos las unificaciones del contacto. */
export const OPPORTUNITY_HISTORY_KIND_VALUES = [
  'note',
  'status_change',
  'inquiry',
  'listing_sent',
  'listing_viewed',
  'listing_reaction',
  'message',
] as const satisfies readonly ClientActivityKindValue[];

export const ListOpportunityHistoryQuerySchema = pageQuerySchema({
  sortable: ['occurredAt'],
  defaultSort: { field: 'occurredAt', direction: 'desc' },
}).extend({
  opportunityId: z.uuid(),
  kind: z.enum(OPPORTUNITY_HISTORY_KIND_VALUES).optional(),
});
export type ListOpportunityHistoryQuery = z.input<typeof ListOpportunityHistoryQuerySchema>;

export const ListClientActivityQuerySchema = pageQuerySchema({
  sortable: ['occurredAt'],
  defaultSort: { field: 'occurredAt', direction: 'desc' },
}).extend({
  clientId: z.uuid(),
  kind: z.enum(CLIENT_ACTIVITY_KIND_VALUES).optional(),
});
export type ListClientActivityQuery = z.input<typeof ListClientActivityQuerySchema>;

export const AddClientNoteInputSchema = z.object({
  clientId: z.uuid(),
  /** La nota se escribe sobre una oportunidad del contacto (desde el tablero). */
  opportunityId: z.uuid().optional(),
  text: z
    .string()
    .trim()
    .min(1, 'Escribí la nota.')
    .max(MAX_CLIENT_NOTE_LENGTH, `La nota puede tener hasta ${MAX_CLIENT_NOTE_LENGTH} caracteres.`),
});
export type AddClientNoteInput = z.input<typeof AddClientNoteInputSchema>;

/** Lo propio de cada tipo de actividad. Otros registros van por ID. */
export type ClientActivityBody =
  | { readonly kind: 'note'; readonly text: string }
  | {
      readonly kind: 'status_change';
      readonly from: OpportunityStatusValue | undefined;
      readonly to: OpportunityStatusValue;
      /** El estado editable, con su nombre de hoy (las entradas anteriores a #9 no lo tienen). */
      readonly fromStage: OpportunityStageRef | undefined;
      readonly toStage: OpportunityStageRef | undefined;
    }
  | {
      readonly kind: 'listing_sent';
      readonly channel: string;
      readonly propertyIds: readonly string[];
    }
  | { readonly kind: 'listing_viewed'; readonly propertyId: string | undefined }
  | {
      readonly kind: 'listing_reaction';
      readonly propertyId: string;
      readonly reaction: 'liked' | 'disliked';
    }
  | {
      readonly kind: 'inquiry';
      readonly channel: string;
      readonly type: string;
      readonly intent: string;
      readonly propertyId: string | undefined;
      /** Volvió a consultar por una oportunidad que ya tenía abierta. */
      readonly followUp: boolean;
      /** Lo que pidió, en palabras del agente de IA o del portal. */
      readonly note: string | undefined;
    }
  | { readonly kind: 'message'; readonly conversationId: string; readonly channel: string }
  | { readonly kind: 'merge'; readonly mergedClientId: string };

/** Quién la generó: un usuario, el agente de IA o el sistema. */
export type ClientActivityActor =
  | { readonly kind: 'user'; readonly id: string; readonly name: string | undefined }
  | { readonly kind: 'agent' }
  | { readonly kind: 'system' };

export type ClientActivityRow = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly opportunityId: string | undefined;
  readonly actor: ClientActivityActor;
} & ClientActivityBody;

// ---------- Destacadas ----------

/** Cuántas propiedades se destacan de una vez. */
export const MAX_FEATURE_PER_REQUEST = 50;

export const FeaturePropertiesInputSchema = z.object({
  clientId: z.uuid(),
  propertyIds: z.array(z.uuid()).min(1).max(MAX_FEATURE_PER_REQUEST),
});
export type FeaturePropertiesInput = z.input<typeof FeaturePropertiesInputSchema>;

export interface FeaturePropertiesOutput {
  /** Las que se sumaron (las que ya estaban destacadas no cuentan). */
  readonly featured: number;
}

export const UnfeaturePropertyInputSchema = z.object({
  clientId: z.uuid(),
  propertyId: z.uuid(),
});
export type UnfeaturePropertyInput = z.input<typeof UnfeaturePropertyInputSchema>;

export const ListClientFeaturedQuerySchema = pageQuerySchema({
  sortable: ['featuredAt'],
  defaultSort: { field: 'featuredAt', direction: 'desc' },
}).extend({ clientId: z.uuid() });
export type ListClientFeaturedQuery = z.input<typeof ListClientFeaturedQuerySchema>;

export const FeaturedPropertyIdsInputSchema = z.object({
  clientId: z.uuid(),
  propertyIds: z.array(z.uuid()).max(100),
});
export type FeaturedPropertyIdsInput = z.input<typeof FeaturedPropertyIdsInputSchema>;

export interface ClientListingOperation {
  readonly operation: string;
  readonly currency: string;
  /** `null`: sin precio o "precio a consultar". */
  readonly priceCents: bigint | null;
}

/** Lo que se muestra de una propiedad en la ficha del contacto (módulo properties). */
export interface ClientListingSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly address: string | undefined;
  readonly status: string;
  readonly operations: readonly ClientListingOperation[];
  readonly coverImageUrl: string | undefined;
  /** Captador. */
  readonly producer: ClientUserRef | undefined;
}

export interface ClientFeaturedRow {
  readonly id: string;
  readonly propertyId: string;
  /** `undefined`: la propiedad ya no está en la cartera (borrada). */
  readonly property: ClientListingSummary | undefined;
  readonly matchScore: number | undefined;
  readonly reaction: 'liked' | 'disliked' | undefined;
  readonly featuredBy: ClientUserRef | undefined;
  readonly featuredAt: Date;
}

// ---------- Búsquedas guardadas ----------

export const ListClientSavedSearchesQuerySchema = pageQuerySchema({
  sortable: ['updatedAt'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({ clientId: z.uuid() });
export type ListClientSavedSearchesQuery = z.input<typeof ListClientSavedSearchesQuerySchema>;

export interface ClientSavedSearchRow {
  readonly id: string;
  readonly name: string | undefined;
  readonly operation: string;
  readonly propertyTypes: readonly string[];
  readonly currency: string | undefined;
  readonly minPriceCents: bigint | undefined;
  readonly maxPriceCents: bigint | undefined;
  readonly locationCount: number;
  readonly minRooms: number | undefined;
  readonly autoSend: boolean;
  readonly unsubscribed: boolean;
  readonly lastMatchedAt: Date | undefined;
  readonly updatedAt: Date;
}

// ---------- Contadores de las pestañas ----------

export interface ClientTabCounts {
  readonly activity: number;
  readonly opportunities: number;
  readonly featured: number;
  readonly savedSearches: number;
  /** Empresas, grupos y contactos relacionados, en los dos sentidos. */
  readonly relations: number;
}

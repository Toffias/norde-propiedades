// Contracts de Noticias (#16): el feed de actividad de la empresa, leído del historial.

import { z } from 'zod';

import type {
  Currency,
  Operation,
  PropertyStatusValue,
  PropertyType,
} from '../../properties/contracts';
import { pageQuerySchema } from '../../shared/contracts';
import type { HistoryChange } from './index';

/** Los mismos que `NEWS_KINDS` del dominio (lo verifica un test), en el orden del selector. */
export const NEWS_KIND_VALUES = [
  'client.created',
  'client.reassigned',
  'client.deleted',
  'property.created',
  'property.status_changed',
  'property.operation_changed',
  'property.price_changed',
  'property.reservation',
] as const;
export type NewsKindValue = (typeof NEWS_KIND_VALUES)[number];

/** Tarjetas por tanda del scroll infinito. */
export const NEWS_PAGE_SIZE = 15;
export const NEWS_MAX_PAGE_SIZE = 30;
/** Entradas que trae cada tarjeta; las demás se ven en el historial de la entidad. */
export const NEWS_ENTRIES_PER_CARD = 20;

/** El feed va siempre de lo más nuevo a lo más viejo; sin tipos, se ven todos. */
export const NewsFeedQuerySchema = pageQuerySchema({
  sortable: ['occurredAt'],
  defaultSort: { field: 'occurredAt', direction: 'desc' },
}).extend({
  pageSize: z.coerce.number().int().min(1).max(NEWS_MAX_PAGE_SIZE).default(NEWS_PAGE_SIZE),
  kinds: z
    .array(z.enum(NEWS_KIND_VALUES))
    .max(NEWS_KIND_VALUES.length)
    .default([...NEWS_KIND_VALUES]),
});
export type ListNewsQuery = z.input<typeof NewsFeedQuerySchema>;

export interface NewsPropertyHeader {
  readonly entityType: 'property';
  readonly code: string;
  readonly title: string;
  readonly propertyType: PropertyType;
  readonly neighborhood: string;
  readonly status: PropertyStatusValue;
  readonly operations: readonly {
    readonly operation: Operation;
    readonly currency: Currency;
    readonly priceCents: bigint | null;
  }[];
  readonly deleted: boolean;
}

export interface NewsClientHeader {
  readonly entityType: 'client';
  readonly name: string | undefined;
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string | undefined;
  }[];
  readonly deleted: boolean;
}

/** Cabecera de la tarjeta: la entidad como está hoy. `undefined` si ya no existe (supresión). */
export type NewsHeader = NewsPropertyHeader | NewsClientHeader;

export interface NewsEntryRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly kind: NewsKindValue;
  readonly action: string;
  readonly actor: { readonly id: string; readonly name: string | undefined };
  /** El agente que recibió un contacto reasignado. */
  readonly assignee: { readonly id: string; readonly name: string | undefined } | undefined;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

/** Una tarjeta del feed: una entidad en un día, con sus novedades de la más nueva a la más vieja. */
export interface NewsCard {
  readonly entityType: 'property' | 'client';
  readonly entityId: string;
  /** `AAAA-MM-DD` en Buenos Aires. */
  readonly day: string;
  readonly header: NewsHeader | undefined;
  readonly entries: readonly NewsEntryRow[];
  /** Novedades de ese día que no vinieron en `entries`. */
  readonly moreCount: number;
}

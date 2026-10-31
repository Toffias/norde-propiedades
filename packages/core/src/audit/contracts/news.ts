// Contracts de Noticias (#16): el feed de actividad de la empresa, leído del historial.

import { z } from 'zod';

import type {
  Currency,
  Operation,
  PropertyCover,
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

/**
 * El período del resumen de Noticias, en días de Buenos Aires: hoy, ayer o los últimos 7 días
 * (hoy incluido). Sin período, el feed no tiene límite de fechas.
 */
export const NEWS_PERIODS = ['today', 'yesterday', 'week'] as const;
export type NewsPeriod = (typeof NEWS_PERIODS)[number];

/** Días que muestra el gráfico de actividad del resumen, hoy incluido. */
export const NEWS_ACTIVITY_DAYS = 7;

const newsKindsSchema = z
  .array(z.enum(NEWS_KIND_VALUES))
  .max(NEWS_KIND_VALUES.length)
  .default([...NEWS_KIND_VALUES]);

/** El feed va siempre de lo más nuevo a lo más viejo; sin tipos, se ven todos. */
export const NewsFeedQuerySchema = pageQuerySchema({
  sortable: ['occurredAt'],
  defaultSort: { field: 'occurredAt', direction: 'desc' },
}).extend({
  pageSize: z.coerce.number().int().min(1).max(NEWS_MAX_PAGE_SIZE).default(NEWS_PAGE_SIZE),
  kinds: newsKindsSchema,
  period: z.enum(NEWS_PERIODS).optional(),
});
export type ListNewsQuery = z.input<typeof NewsFeedQuerySchema>;

/** La actividad de los últimos días, para el gráfico del resumen. */
export const NewsActivityQuerySchema = z.object({ kinds: newsKindsSchema });
export type GetNewsActivityQuery = z.input<typeof NewsActivityQuerySchema>;

/**
 * Novedades de un día: cada entidad cuenta una vez por tipo de noticia, como las tarjetas de las
 * secciones del resumen.
 */
export interface NewsActivityDay {
  /** `AAAA-MM-DD` en Buenos Aires. */
  readonly day: string;
  readonly count: number;
}

export interface NewsActivity {
  /** Del más viejo a hoy, uno por día (con cero los días sin novedades). */
  readonly days: readonly NewsActivityDay[];
}

export interface NewsPropertyHeader {
  readonly entityType: 'property';
  readonly code: string;
  readonly title: string;
  readonly propertyType: PropertyType;
  readonly neighborhood: string;
  readonly status: PropertyStatusValue;
  /** La portada, o la primera foto si no se eligió portada; `hasThumbnail` cuando ya está la miniatura. */
  readonly cover: PropertyCover | undefined;
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

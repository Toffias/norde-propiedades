// Contracts de los procesos en segundo plano de la barra superior: lo que corre en los jobs.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

/**
 * Qué proceso es: las variantes de las fotos de una ficha, las importaciones, las acciones masivas
 * de oportunidades, los PDF de la ficha y las publicaciones en los portales.
 */
export const BACKGROUND_TASK_KINDS = [
  'media_variants',
  'client_import',
  'property_import',
  'unit_import',
  'tokko_users_import',
  'opportunity_bulk',
  'property_document',
  'portal_listing',
] as const;
export type BackgroundTaskKind = (typeof BACKGROUND_TASK_KINDS)[number];

/** `pending`: esperando su turno en la cola. `running`: procesándose. */
export const BACKGROUND_TASK_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type BackgroundTaskStatus = (typeof BACKGROUND_TASK_STATUSES)[number];

/** `mine`: los que pidió quien consulta. `all`: los de todos y los del sistema (con permiso). */
export const BACKGROUND_TASK_SCOPES = ['mine', 'all'] as const;
export type BackgroundTaskScope = (typeof BACKGROUND_TASK_SCOPES)[number];

/** El panel de la barra muestra pocos por vez; el resto se pide con "Ver más". */
export const BACKGROUND_TASKS_PAGE_SIZE = 10;
export const MAX_BACKGROUND_TASKS_PAGE_SIZE = 50;

const scopeSchema = z.enum(BACKGROUND_TASK_SCOPES).default('mine');
/**
 * Hasta cuándo limpió los terminados quien consulta (ISO 8601): los que terminaron antes no se
 * muestran. Los en curso se muestran siempre.
 */
const clearedAtSchema = z.iso.datetime({ offset: true }).optional();

export const ListBackgroundTasksQuerySchema = pageQuerySchema({
  sortable: ['recent'],
  defaultSort: { field: 'recent', direction: 'desc' },
}).extend({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_BACKGROUND_TASKS_PAGE_SIZE)
    .default(BACKGROUND_TASKS_PAGE_SIZE),
  scope: scopeSchema,
  clearedAt: clearedAtSchema,
});
export type ListBackgroundTasksQuery = z.input<typeof ListBackgroundTasksQuerySchema>;

export const CountBackgroundTasksQuerySchema = z.object({ scope: scopeSchema });
export type CountBackgroundTasksQuery = z.input<typeof CountBackgroundTasksQuerySchema>;

/** La ficha sobre la que corre: las fotos, el PDF, la publicación o las unidades importadas. */
export type BackgroundTaskSubject =
  | {
      readonly kind: 'property';
      readonly id: string;
      readonly code: string;
      readonly title: string;
    }
  | { readonly kind: 'development'; readonly id: string; readonly name: string };

export interface BackgroundTaskRow {
  /** Único en la lista: el tipo y su registro (en las fotos, la ficha y quien las subió). */
  readonly id: string;
  readonly kind: BackgroundTaskKind;
  /** La importación, la acción masiva, el PDF o la publicación. En las fotos, la ficha. */
  readonly sourceId: string;
  readonly status: BackgroundTaskStatus;
  readonly subject: BackgroundTaskSubject | undefined;
  /**
   * El archivo importado, el tipo de PDF (`sheet`…), el portal (`mercadolibre`…), la acción masiva
   * (`change_stage`…) o el origen de la importación de propiedades (`api`).
   */
  readonly detail: string | undefined;
  /** Cuántos lleva de cuántos, si se sabe. */
  readonly progress: { readonly done: number; readonly total: number } | undefined;
  /** Filas con problemas, fotos que fallaron u oportunidades salteadas. */
  readonly problems: number;
  /** Por qué falló: un código (`file_missing`…) o el mensaje del portal. */
  readonly failure: string | undefined;
  /** Quien lo pidió; sin él, lo corrió el sistema (la importación de Tokko). */
  readonly requester: { readonly id: string; readonly name: string | undefined } | undefined;
  readonly createdAt: Date;
  readonly finishedAt: Date | undefined;
}

/** Una página de la lista (la misma forma que `Page`), con el contador de la barra. */
export interface BackgroundTasksPage {
  readonly items: readonly BackgroundTaskRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Cuántos siguen en curso (en espera o procesándose), para el contador de la barra. */
  readonly active: number;
}

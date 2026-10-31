// Contracts del historial de un usuario (Mi cuenta): todo lo que hizo en el sistema.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';
import type { HistoryChange } from './index';

/** Las mismas que `ACTIVITY_AREAS` del dominio (lo verifica un test), en el orden del selector. */
export const ACTIVITY_AREA_VALUES = [
  'properties',
  'developments',
  'clients',
  'opportunities',
  'appraisals',
  'users',
  'other',
] as const;
export type ActivityAreaValue = (typeof ACTIVITY_AREA_VALUES)[number];

export const ACTIVITY_PAGE_SIZE = 25;

export const ListMyActivityQuerySchema = pageQuerySchema({
  sortable: ['occurredAt'],
  defaultSort: { field: 'occurredAt', direction: 'desc' },
}).extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(ACTIVITY_PAGE_SIZE),
  area: z.enum(ACTIVITY_AREA_VALUES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListMyActivityQuery = z.input<typeof ListMyActivityQuerySchema>;

/** La entidad sobre la que se actuó, para nombrarla y enlazarla. */
export interface ActivityEntity {
  /** Código de referencia (propiedades, emprendimientos, tasaciones). */
  readonly code: string | undefined;
  /** Título, nombre o dirección. */
  readonly name: string | undefined;
  /** De una oportunidad: su contacto, que es donde se ve. */
  readonly clientId: string | undefined;
  readonly deleted: boolean;
}

/** Una acción del usuario: qué hizo, sobre qué entidad y qué cambió. */
export interface ActivityEntryRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly area: ActivityAreaValue;
  readonly entityType: string;
  readonly entityId: string;
  /** `undefined` si la entidad ya no existe o no se puede mostrar. */
  readonly entity: ActivityEntity | undefined;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

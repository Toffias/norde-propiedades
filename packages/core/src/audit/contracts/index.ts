// Contracts del módulo audit (`@norde/core/audit/contracts`): importables desde el cliente.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

export * from './news';

/** Valor crudo tal como quedó en el historial: centavos, IDs, fechas ISO, listas y objetos. */
export type HistoryValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | readonly HistoryValue[]
  | { readonly [field: string]: HistoryValue };

export interface HistoryChange {
  readonly before: HistoryValue;
  readonly after: HistoryValue;
}

/** Una entrada del historial de una entidad, para la pestaña Historial de su ficha. */
export interface HistoryEntryRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actor: { readonly id: string; readonly name: string | undefined };
  /** `gestion`, `agent`, `web`, `scheduler`, `import`. */
  readonly source: string | undefined;
  readonly action: string;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

/** Base de los filtros de un historial: quién, desde y hasta (fechas `AAAA-MM-DD`). */
export const historyQuerySchema = () =>
  pageQuerySchema({
    sortable: ['occurredAt'],
    defaultSort: { field: 'occurredAt', direction: 'desc' },
  }).extend({
    actorId: z.string().trim().min(1).max(100).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  });

import type { HistoryChange } from '@norde/core/audit';
import { z } from 'zod';

import { fromJsonb } from '../db/json';

// Los valores crudos del historial, tal como los guarda `toJsonb` (los `bigint` ya recuperados).
const HistoryValueSchema: z.ZodType<HistoryChange['before']> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.bigint(),
    z.null(),
    z.array(HistoryValueSchema),
    z.record(z.string(), HistoryValueSchema),
  ]),
);
const ChangesSchema = z
  .record(z.string(), z.object({ before: HistoryValueSchema, after: HistoryValueSchema }))
  .catch({});

/** El diff de una entrada de `audit_log` (`changes`), con los `bigint` recuperados. */
export function parseHistoryChanges(changes: unknown): Readonly<Record<string, HistoryChange>> {
  return ChangesSchema.parse(fromJsonb(changes ?? {}));
}

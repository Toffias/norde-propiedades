import {
  APPRAISAL_CURRENCIES,
  type AppraisalComparable,
  type AppraisalResult,
  type AppraisalValueRange,
} from '@norde/core/appraisals';
import { z } from 'zod';

import type { appraisals } from '../db/schema';

// El resultado de una tasación en sus columnas: los valores sugeridos en centavos con su moneda y
// los comparables en `comparables` (jsonb), con los centavos como texto (JSON no tiene bigint).

type AppraisalDbRow = typeof appraisals.$inferSelect;

const CurrencySchema = z.enum(APPRAISAL_CURRENCIES);

const StoredComparableSchema = z.object({
  address: z.string(),
  priceCents: z.string().regex(/^\d+$/),
  currency: CurrencySchema,
  surfaceM2: z.number().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
});
type StoredComparable = z.infer<typeof StoredComparableSchema>;

const StoredComparablesSchema = z.array(StoredComparableSchema);

function range(
  min: bigint | null,
  max: bigint | null,
  currency: string | null,
): AppraisalValueRange | undefined {
  if (min === null || max === null || currency === null) return undefined;
  return { minCents: min, maxCents: max, currency: CurrencySchema.parse(currency) };
}

export function resultFromRow(row: AppraisalDbRow): AppraisalResult {
  return {
    sale: range(row.saleMinCents, row.saleMaxCents, row.saleCurrency),
    rent: range(row.rentMinCents, row.rentMaxCents, row.rentCurrency),
    comparables: StoredComparablesSchema.parse(row.comparables).map(
      (stored): AppraisalComparable => ({
        address: stored.address,
        priceCents: BigInt(stored.priceCents),
        currency: stored.currency,
        surfaceM2: stored.surfaceM2,
        url: stored.url,
        note: stored.note,
      }),
    ),
    observations: row.observations ?? undefined,
  };
}

function storedComparable(comparable: AppraisalComparable): StoredComparable {
  return {
    address: comparable.address,
    priceCents: comparable.priceCents.toString(),
    currency: comparable.currency,
    ...(comparable.surfaceM2 === undefined ? {} : { surfaceM2: comparable.surfaceM2 }),
    ...(comparable.url === undefined ? {} : { url: comparable.url }),
    ...(comparable.note === undefined ? {} : { note: comparable.note }),
  };
}

export function resultColumns(result: AppraisalResult) {
  return {
    saleMinCents: result.sale?.minCents ?? null,
    saleMaxCents: result.sale?.maxCents ?? null,
    saleCurrency: result.sale?.currency ?? null,
    rentMinCents: result.rent?.minCents ?? null,
    rentMaxCents: result.rent?.maxCents ?? null,
    rentCurrency: result.rent?.currency ?? null,
    comparables: result.comparables.map(storedComparable),
    observations: result.observations ?? null,
  };
}

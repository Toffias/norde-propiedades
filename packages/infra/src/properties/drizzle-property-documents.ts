import {
  PROPERTY_DOCUMENT_KINDS,
  PROPERTY_DOCUMENT_STATUSES,
  PropertyDocument,
  type PropertyDocumentId,
  type PropertyDocumentQuery,
  type PropertyDocumentRepository,
  type PropertyDocumentRow,
} from '@norde/core/properties';
import { parseId, type PageSlice, type Result } from '@norde/core/shared';
import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { propertyDocuments } from '../db/schema';

const DocumentEnums = z.object({
  kind: z.enum(PROPERTY_DOCUMENT_KINDS),
  status: z.enum(PROPERTY_DOCUMENT_STATUSES),
});

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in property_documents');
  return result.value;
}

function period(row: { periodFrom: string | null; periodTo: string | null }) {
  return row.periodFrom === null || row.periodTo === null
    ? undefined
    : { from: row.periodFrom, to: row.periodTo };
}

export class DrizzlePropertyDocumentRepository implements PropertyDocumentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: PropertyDocumentId): Promise<PropertyDocument | undefined> {
    const [row] = await this.db
      .select()
      .from(propertyDocuments)
      .where(eq(propertyDocuments.id, id))
      .limit(1);
    if (!row) return undefined;
    const enums = DocumentEnums.parse(row);
    return PropertyDocument.restore({
      id: stored(parseId<'PropertyDocument'>(row.id)),
      propertyId: stored(parseId<'Property'>(row.propertyId)),
      kind: enums.kind,
      status: enums.status,
      period: period(row),
      storageKey: row.storageKey ?? undefined,
      error: row.error ?? undefined,
      requestedBy: row.requestedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(document: PropertyDocument, actorId: string): Promise<void> {
    const s = document.toSnapshot();
    const values = {
      status: s.status,
      storageKey: s.storageKey ?? null,
      error: s.error ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(propertyDocuments)
      .values({
        id: s.id,
        propertyId: s.propertyId,
        kind: s.kind,
        periodFrom: s.period?.from ?? null,
        periodTo: s.period?.to ?? null,
        requestedBy: s.requestedBy,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: propertyDocuments.id, set: values });
  }
}

/** Los PDF de una propiedad, del más nuevo al más viejo, con el índice por propiedad y fecha. */
export class DrizzlePropertyDocumentQuery implements PropertyDocumentQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(criteria: {
    readonly propertyId: string;
    readonly offset: number;
    readonly limit: number;
  }): Promise<
    PageSlice<Omit<PropertyDocumentRow, 'requestedBy'> & { readonly requestedBy: string }>
  > {
    const where = eq(propertyDocuments.propertyId, criteria.propertyId);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(propertyDocuments)
        .where(where)
        .orderBy(desc(propertyDocuments.createdAt), desc(propertyDocuments.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(propertyDocuments).where(where),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        ...DocumentEnums.parse(row),
        period: period(row),
        error: row.error ?? undefined,
        requestedBy: row.requestedBy,
        createdAt: row.createdAt,
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}

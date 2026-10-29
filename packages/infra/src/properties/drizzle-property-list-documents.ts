import {
  PROPERTY_DOCUMENT_STATUSES,
  PROPERTY_SHEET_LAYOUTS,
  PropertyListDocument,
  type PropertyListDocumentId,
  type PropertyListDocumentRepository,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { propertyListDocuments } from '../db/schema';

const DocumentEnums = z.object({
  layout: z.enum(PROPERTY_SHEET_LAYOUTS),
  status: z.enum(PROPERTY_DOCUMENT_STATUSES),
});

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in property_list_documents');
  return result.value;
}

/** El PDF de una selección del buscador (#175). */
export class DrizzlePropertyListDocumentRepository implements PropertyListDocumentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: PropertyListDocumentId): Promise<PropertyListDocument | undefined> {
    const [row] = await this.db
      .select()
      .from(propertyListDocuments)
      .where(eq(propertyListDocuments.id, id))
      .limit(1);
    if (!row) return undefined;
    const enums = DocumentEnums.parse(row);
    return PropertyListDocument.restore({
      id: stored(parseId<'PropertyListDocument'>(row.id)),
      propertyIds: row.propertyIds.map((propertyId) => stored(parseId<'Property'>(propertyId))),
      layout: enums.layout,
      includeAgent: row.includeAgent,
      status: enums.status,
      storageKey: row.storageKey ?? undefined,
      error: row.error ?? undefined,
      requestedBy: row.requestedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(document: PropertyListDocument, actorId: string): Promise<void> {
    const s = document.toSnapshot();
    const values = {
      status: s.status,
      storageKey: s.storageKey ?? null,
      error: s.error ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(propertyListDocuments)
      .values({
        id: s.id,
        propertyIds: [...s.propertyIds],
        layout: s.layout,
        includeAgent: s.includeAgent,
        requestedBy: s.requestedBy,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: propertyListDocuments.id, set: values });
  }
}

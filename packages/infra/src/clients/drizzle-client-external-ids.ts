import type { ClientExternalId, ClientExternalIds, ExternalIdSource } from '@norde/core/clients';
import type { IdGenerator } from '@norde/core/shared';
import { and, eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { importMappings } from '../db/schema';

const ENTITY_TYPE = 'client';

/** El ID que un contacto tiene en Tokko, en `import_mappings` (único por origen, tipo e ID). */
export class DrizzleClientExternalIds implements ClientExternalIds {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async find(source: ExternalIdSource, externalId: string): Promise<ClientExternalId | undefined> {
    const [row] = await this.db
      .select({ clientId: importMappings.internalId, erasedAt: importMappings.erasedAt })
      .from(importMappings)
      .where(
        and(
          eq(importMappings.source, source),
          eq(importMappings.entityType, ENTITY_TYPE),
          eq(importMappings.externalId, externalId),
        ),
      )
      .limit(1);
    return row && { clientId: row.clientId, erased: row.erasedAt !== null };
  }

  async link(input: {
    readonly source: ExternalIdSource;
    readonly externalId: string;
    readonly clientId: string;
    readonly now: Date;
  }): Promise<void> {
    await this.db
      .insert(importMappings)
      .values({
        id: this.ids.next(),
        source: input.source,
        entityType: ENTITY_TYPE,
        externalId: input.externalId,
        internalId: input.clientId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({
        target: [importMappings.source, importMappings.entityType, importMappings.externalId],
      });
  }
}

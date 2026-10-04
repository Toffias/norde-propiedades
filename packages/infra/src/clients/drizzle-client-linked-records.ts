import type { ClientLinkedRecords, ClientRecordCounts } from '@norde/core/clients';
import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import {
  clientActivities,
  clientRelations,
  featuredListings,
  importMappings,
  inquiries,
  opportunities,
  savedSearches,
  sharedListings,
} from '../db/schema';

/**
 * Lo que cuelga de un contacto en las tablas del módulo clients, fuera de su aggregate. Al
 * unificar se reapunta con un `update` por tabla (con sus índices por `client_id`), sin traer las
 * filas: un contacto con años de actividad puede tener miles.
 */
export class DrizzleClientLinkedRecords implements ClientLinkedRecords {
  constructor(private readonly db: DbExecutor) {}

  async countFor(clientId: string): Promise<ClientRecordCounts> {
    // En serie: dentro de una transacción todas usan la misma conexión.
    const total = async (query: Promise<{ total: number }[]>) => (await query)[0]?.total ?? 0;
    return {
      opportunities: await total(
        this.db
          .select({ total: count() })
          .from(opportunities)
          .where(eq(opportunities.clientId, clientId)),
      ),
      activities: await total(
        this.db
          .select({ total: count() })
          .from(clientActivities)
          .where(eq(clientActivities.clientId, clientId)),
      ),
      savedSearches: await total(
        this.db
          .select({ total: count() })
          .from(savedSearches)
          .where(and(eq(savedSearches.clientId, clientId), isNull(savedSearches.deletedAt))),
      ),
      featuredListings: await total(
        this.db
          .select({ total: count() })
          .from(featuredListings)
          .where(and(eq(featuredListings.clientId, clientId), isNull(featuredListings.removedAt))),
      ),
      sharedListings: await total(
        this.db
          .select({ total: count() })
          .from(sharedListings)
          .where(eq(sharedListings.clientId, clientId)),
      ),
      inquiries: await total(
        this.db.select({ total: count() }).from(inquiries).where(eq(inquiries.clientId, clientId)),
      ),
      incomingRelations: await total(
        this.db
          .select({ total: count() })
          .from(clientRelations)
          .where(eq(clientRelations.relatedClientId, clientId)),
      ),
    };
  }

  async moveAll(fromId: string, toId: string, now: Date): Promise<ClientRecordCounts> {
    const moved = async (query: Promise<{ id: string }[]>) => (await query).length;

    const opportunitiesMoved = await moved(
      this.db
        .update(opportunities)
        .set({ clientId: toId })
        .where(eq(opportunities.clientId, fromId))
        .returning({ id: opportunities.id }),
    );
    const activitiesMoved = await moved(
      this.db
        .update(clientActivities)
        .set({ clientId: toId })
        .where(eq(clientActivities.clientId, fromId))
        .returning({ id: clientActivities.id }),
    );
    const searchesMoved = await moved(
      this.db
        .update(savedSearches)
        .set({ clientId: toId })
        .where(eq(savedSearches.clientId, fromId))
        .returning({ id: savedSearches.id }),
    );

    // Una destacada que los dos tienen activa no puede quedar dos veces (índice único): la del
    // duplicado se mueve como quitada, con su reacción y su historia.
    await this.db
      .update(featuredListings)
      .set({ removedAt: now, updatedAt: now })
      .where(
        and(
          eq(featuredListings.clientId, fromId),
          isNull(featuredListings.removedAt),
          inArray(
            featuredListings.propertyId,
            this.db
              .select({ propertyId: featuredListings.propertyId })
              .from(featuredListings)
              .where(and(eq(featuredListings.clientId, toId), isNull(featuredListings.removedAt))),
          ),
        ),
      );
    const featuredMoved = await moved(
      this.db
        .update(featuredListings)
        .set({ clientId: toId })
        .where(eq(featuredListings.clientId, fromId))
        .returning({ id: featuredListings.id }),
    );
    const sharedMoved = await moved(
      this.db
        .update(sharedListings)
        .set({ clientId: toId })
        .where(eq(sharedListings.clientId, fromId))
        .returning({ id: sharedListings.id }),
    );
    const inquiriesMoved = await moved(
      this.db
        .update(inquiries)
        .set({ clientId: toId })
        .where(eq(inquiries.clientId, fromId))
        .returning({ id: inquiries.id }),
    );
    // El mapeo con Tokko: al reimportar, el contacto de origen resuelve al principal.
    await this.db
      .update(importMappings)
      .set({ internalId: toId })
      .where(and(eq(importMappings.entityType, 'client'), eq(importMappings.internalId, fromId)));

    // Relaciones que otros declaran hacia el duplicado: pasan al principal. Las que el principal
    // ya tiene con ese contacto (o las del principal mismo) se descartan.
    await this.db.delete(clientRelations).where(
      and(
        eq(clientRelations.relatedClientId, fromId),
        sql`(${clientRelations.clientId} = ${toId} or exists (
          select 1 from ${clientRelations} same
          where same.client_id = ${clientRelations.clientId}
            and same.related_client_id = ${toId}
            and same.kind = ${clientRelations.kind}
        ))`,
      ),
    );
    const relationsMoved = await moved(
      this.db
        .update(clientRelations)
        .set({ relatedClientId: toId })
        .where(and(eq(clientRelations.relatedClientId, fromId), ne(clientRelations.clientId, toId)))
        .returning({ id: clientRelations.clientId }),
    );

    return {
      opportunities: opportunitiesMoved,
      activities: activitiesMoved,
      savedSearches: searchesMoved,
      featuredListings: featuredMoved,
      sharedListings: sharedMoved,
      inquiries: inquiriesMoved,
      incomingRelations: relationsMoved,
    };
  }
}

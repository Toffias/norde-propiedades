import type { PropertyOwnerLinks } from '@norde/core/properties';
import type { Clock } from '@norde/core/shared';

import { and, count, eq, isNull } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { clients, propertyOwners } from '../db/schema';

/** Los propietarios de cada propiedad (`property_owners`). */
export class DrizzlePropertyOwnerLinks implements PropertyOwnerLinks {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async add(propertyId: string, clientId: string, actorId: string): Promise<void> {
    await this.db
      .insert(propertyOwners)
      .values({ propertyId, clientId, createdAt: this.clock.now(), createdBy: actorId })
      .onConflictDoNothing();
  }

  async remove(propertyId: string, clientId: string): Promise<void> {
    await this.db.delete(propertyOwners).where(link(propertyId, clientId));
  }

  /** Por la clave primaria (`property_id`, `client_id`). */
  async hasAny(propertyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ clientId: propertyOwners.clientId })
      .from(propertyOwners)
      .where(eq(propertyOwners.propertyId, propertyId))
      .limit(1);
    return row !== undefined;
  }

  async has(propertyId: string, clientId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ clientId: propertyOwners.clientId })
      .from(propertyOwners)
      .where(link(propertyId, clientId))
      .limit(1);
    return row !== undefined;
  }

  async count(propertyId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(propertyOwners)
      .where(eq(propertyOwners.propertyId, propertyId));
    return row?.total ?? 0;
  }

  /**
   * El cliente por ID (no hay foreign key entre módulos): ni en la papelera ni unificado con otro.
   * Los suprimidos ya no están.
   */
  async isLinkable(clientId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt), isNull(clients.mergedIntoId)))
      .limit(1);
    return row !== undefined;
  }
}

function link(propertyId: string, clientId: string) {
  return and(eq(propertyOwners.propertyId, propertyId), eq(propertyOwners.clientId, clientId));
}

import type { PropertyOwnerLinks } from '@norde/core/properties';
import type { Clock } from '@norde/core/shared';

import { eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { propertyOwners } from '../db/schema';

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

  /** Por la clave primaria (`property_id`, `client_id`). */
  async hasAny(propertyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ clientId: propertyOwners.clientId })
      .from(propertyOwners)
      .where(eq(propertyOwners.propertyId, propertyId))
      .limit(1);
    return row !== undefined;
  }
}

import type { PropertyOwnerLinks } from '@norde/core/properties';
import type { Clock } from '@norde/core/shared';

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
}

import type { PropertyClientErasure } from '@norde/core/properties';
import { inArray } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { developments, propertyOwners } from '../db/schema';

/** Supresión: los clientes suprimidos dejan de ser propietarios y contactos comerciales. */
export class DrizzlePropertyClientErasure implements PropertyClientErasure {
  constructor(private readonly db: DbExecutor) {}

  async unlinkClients(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const ids = [...clientIds];
    const owners = await this.db
      .delete(propertyOwners)
      .where(inArray(propertyOwners.clientId, ids))
      .returning({ propertyId: propertyOwners.propertyId });
    const contacts = await this.db
      .update(developments)
      .set({ commercialContactClientId: null })
      .where(inArray(developments.commercialContactClientId, ids))
      .returning({ id: developments.id });
    return owners.length + contacts.length;
  }
}

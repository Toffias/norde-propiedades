import type { MovedClientLinks, PropertyClientMerge } from '@norde/core/properties';
import { eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { developments, propertyOwners, reservations } from '../db/schema';

/** Unificación: lo de properties que apuntaba al duplicado pasa al contacto que queda. */
export class DrizzlePropertyClientMerge implements PropertyClientMerge {
  constructor(private readonly db: DbExecutor) {}

  async moveClient(fromClientId: string, toClientId: string): Promise<MovedClientLinks> {
    const moved = await this.db
      .update(reservations)
      .set({ clientId: toClientId })
      .where(eq(reservations.clientId, fromClientId))
      .returning({ propertyId: reservations.propertyId });

    // Propietarios: la PK es (propiedad, cliente). Si los dos eran dueños, queda la fila del que
    // queda; si no, la del duplicado pasa a él con su autoría original.
    const owners = await this.db
      .delete(propertyOwners)
      .where(eq(propertyOwners.clientId, fromClientId))
      .returning();
    if (owners.length > 0) {
      await this.db
        .insert(propertyOwners)
        .values(owners.map((owner) => ({ ...owner, clientId: toClientId })))
        .onConflictDoNothing();
    }

    const contacts = await this.db
      .update(developments)
      .set({ commercialContactClientId: toClientId })
      .where(eq(developments.commercialContactClientId, fromClientId))
      .returning({ id: developments.id });

    return {
      propertyIds: [...new Set([...moved, ...owners].map((row) => row.propertyId))],
      developmentIds: contacts.map((row) => row.id),
    };
  }
}

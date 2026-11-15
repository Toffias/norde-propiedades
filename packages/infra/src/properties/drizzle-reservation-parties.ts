import type { PartyOwnership, ReservationParties } from '@norde/core/properties';

import { and, eq, isNull } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { clients, opportunities } from '../db/schema';

/** El contacto y la oportunidad de una reserva, leídos de las tablas de clients. */
export class DrizzleReservationParties implements ReservationParties {
  constructor(private readonly db: DbExecutor) {}

  async client(clientId: string): Promise<PartyOwnership | undefined> {
    const [row] = await this.db
      .select({ ownerId: clients.agentId, ownerBranchId: clients.branchId })
      .from(clients)
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt), isNull(clients.mergedIntoId)))
      .limit(1);
    return (
      row && { ownerId: row.ownerId ?? undefined, ownerBranchId: row.ownerBranchId ?? undefined }
    );
  }

  async opportunity(
    opportunityId: string,
  ): Promise<(PartyOwnership & { readonly clientId: string }) | undefined> {
    const [row] = await this.db
      .select({
        clientId: opportunities.clientId,
        ownerId: opportunities.agentId,
        ownerBranchId: opportunities.branchId,
      })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);
    return (
      row && {
        clientId: row.clientId,
        ownerId: row.ownerId ?? undefined,
        ownerBranchId: row.ownerBranchId ?? undefined,
      }
    );
  }
}

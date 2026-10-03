import type { DevelopmentChances } from '@norde/core/clients';
import { MAX_DEVELOPMENT_CHANCE_AGENTS } from '@norde/core/properties';
import { parseId } from '@norde/core/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { developmentAgentChances, developments } from '../db/schema';

import { DrizzleDevelopmentRepository } from './drizzle-development-repository';

/**
 * La derivación por chances para el reparto de consultas (puerto de clients), dentro de su
 * transacción. El turno lo decide el aggregate `Development`; acá solo se carga y se guarda.
 */
export class DrizzleDevelopmentChances implements DevelopmentChances {
  private readonly developments: DrizzleDevelopmentRepository;

  constructor(private readonly db: DbExecutor) {
    this.developments = new DrizzleDevelopmentRepository(db);
  }

  /** Por la clave primaria `(development_id, user_id)`. */
  async agentsOf(developmentId: string): Promise<readonly string[]> {
    const id = parseId<'Development'>(developmentId);
    if (id.isErr()) return [];
    const rows = await this.db
      .select({ userId: developmentAgentChances.userId })
      .from(developmentAgentChances)
      .innerJoin(developments, eq(developments.id, developmentAgentChances.developmentId))
      .where(
        and(eq(developmentAgentChances.developmentId, id.value), isNull(developments.deletedAt)),
      )
      .orderBy(asc(developmentAgentChances.position))
      .limit(MAX_DEVELOPMENT_CHANCE_AGENTS);
    return rows.map((row) => row.userId);
  }

  async takeTurn(
    developmentId: string,
    activeUserIds: ReadonlySet<string>,
  ): Promise<string | undefined> {
    const id = parseId<'Development'>(developmentId);
    if (id.isErr()) return undefined;
    const development = await this.developments.findForUpdate(id.value);
    if (!development) return undefined;
    const agentId = development.takeInquiryTurn(activeUserIds);
    if (agentId !== undefined) await this.developments.saveInquiryCursor(development);
    return agentId;
  }
}

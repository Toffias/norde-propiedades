import {
  auditAction,
  err,
  ok,
  USER_BRANCH_CHANGE_BATCH_SIZE,
  UserBranchChangeInputSchema,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
  type UserBranchChangeInput,
} from '../../../shared';
import { clientTarget } from '../client-support';
import { opportunityTarget } from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export interface InvalidBranchChangeInputError {
  readonly type: 'InvalidInput';
}

export type MoveAgentBranchRecordsError = ForbiddenError | InvalidBranchChangeInputError;

/**
 * Reacción a `identity.user_branch_changed` (#221): los contactos y las oportunidades del agente
 * guardan una copia de su sucursal, que usan los permisos "de su sucursal". Los que siguen en la
 * de antes pasan a la nueva, por lotes; cada uno lo deja en su historial. Idempotente: una segunda
 * vez no encuentra nada que mover.
 */
export class MoveAgentBranchRecords {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UserBranchChangeInput,
    actor: Actor,
  ): Promise<
    Result<
      { readonly clients: number; readonly opportunities: number },
      MoveAgentBranchRecordsError
    >
  > {
    if (!actor.can('clients:move-user-branch')) return err({ type: 'Forbidden' });
    const parsed = UserBranchChangeInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { userId, fromBranchId, toBranchId } = parsed.data;
    const branchId = { before: fromBranchId, after: toBranchId };
    const move = () => ({
      ownerId: userId,
      fromBranchId,
      toBranchId,
      limit: USER_BRANCH_CHANGE_BATCH_SIZE,
      actorId: actor.id,
      now: this.deps.clock.now(),
    });

    let clients = 0;
    for (;;) {
      const moved = await this.deps.uow.run(async (tx) => {
        const ids = await tx.clients.moveOwnerBranch(move());
        for (const clientId of ids) {
          await tx.audit.record(
            auditAction(actor, clientTarget('client.branch_changed', clientId), { branchId }),
          );
        }
        return ids.length;
      });
      clients += moved;
      if (moved < USER_BRANCH_CHANGE_BATCH_SIZE) break;
    }

    let opportunities = 0;
    for (;;) {
      const moved = await this.deps.uow.run(async (tx) => {
        const ids = await tx.opportunities.moveOwnerBranch(move());
        for (const opportunityId of ids) {
          const opportunity = await tx.opportunities.findById(opportunityId);
          if (!opportunity) continue;
          await tx.audit.record(
            auditAction(actor, opportunityTarget('opportunity.branch_changed', opportunity), {
              branchId,
            }),
          );
        }
        return ids.length;
      });
      opportunities += moved;
      if (moved < USER_BRANCH_CHANGE_BATCH_SIZE) break;
    }

    return ok({ clients, opportunities });
  }
}

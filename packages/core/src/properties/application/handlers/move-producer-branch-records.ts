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
import { developmentTarget } from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { propertyTarget } from '../property-support';

export interface InvalidBranchChangeInputError {
  readonly type: 'InvalidInput';
}

export type MoveProducerBranchRecordsError = ForbiddenError | InvalidBranchChangeInputError;

/**
 * Reacción a `identity.user_branch_changed` (#221): las propiedades y los emprendimientos del
 * productor guardan una copia de su sucursal, que usan los permisos "de su sucursal". Los que
 * siguen en la de antes pasan a la nueva, por lotes; cada uno lo deja en su historial.
 * Idempotente: una segunda vez no encuentra nada que mover.
 */
export class MoveProducerBranchRecords {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UserBranchChangeInput,
    actor: Actor,
  ): Promise<
    Result<
      { readonly properties: number; readonly developments: number },
      MoveProducerBranchRecordsError
    >
  > {
    if (!actor.can('properties:move-user-branch')) return err({ type: 'Forbidden' });
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

    let properties = 0;
    for (;;) {
      const moved = await this.deps.uow.run(async (tx) => {
        const ids = await tx.properties.moveOwnerBranch(move());
        for (const propertyId of ids) {
          await tx.audit.record(
            auditAction(actor, propertyTarget('property.branch_changed', propertyId), {
              branchId,
            }),
          );
        }
        return ids.length;
      });
      properties += moved;
      if (moved < USER_BRANCH_CHANGE_BATCH_SIZE) break;
    }

    let developments = 0;
    for (;;) {
      const moved = await this.deps.uow.run(async (tx) => {
        const ids = await tx.developments.moveOwnerBranch(move());
        for (const developmentId of ids) {
          const development = await tx.developments.findById(developmentId);
          if (!development) continue;
          await tx.audit.record(
            auditAction(actor, developmentTarget('development.branch_changed', development), {
              branchId,
            }),
          );
        }
        return ids.length;
      });
      developments += moved;
      if (moved < USER_BRANCH_CHANGE_BATCH_SIZE) break;
    }

    return ok({ properties, developments });
  }
}

import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { DevelopmentIdInputSchema, type DevelopmentIdInput } from '../../contracts';
import type {
  DevelopmentAlreadyDeletedError,
  DevelopmentHasUnitsError,
} from '../../domain/development';
import {
  developmentTarget,
  findDevelopment,
  type DevelopmentNotFoundError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type DeleteDevelopmentError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentAlreadyDeletedError
  | DevelopmentHasUnitsError;

/**
 * Manda un emprendimiento a la papelera, con `developments:delete`. Si tiene unidades activas no se
 * puede: primero se borran las unidades.
 */
export class DeleteDevelopment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: DevelopmentIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteDevelopmentError>> {
    if (!actor.can('developments:delete')) return err({ type: 'Forbidden' });
    const parsed = DevelopmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteDevelopmentError>> => {
      const development = await findDevelopment(tx.developments, parsed.data.developmentId);
      if (!development) return err({ type: 'DevelopmentNotFound' });

      const units = await tx.developments.countActiveUnits(development.id);
      const deleted = development.delete(actor.id, units, now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.developments.save(development, actor.id);
      await tx.events.publish(development.pullEvents());
      await tx.audit.record(
        auditAction(actor, developmentTarget('development.deleted', development)),
      );
      return ok(undefined);
    });
  }
}

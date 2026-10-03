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
import type { DevelopmentNotDeletedError } from '../../domain/development';
import {
  developmentTarget,
  findDevelopment,
  type DevelopmentNotFoundError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type RestoreDevelopmentError =
  ForbiddenError | InvalidInputError | DevelopmentNotFoundError | DevelopmentNotDeletedError;

/** Saca un emprendimiento de la papelera, con `developments:delete`. */
export class RestoreDevelopment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: DevelopmentIdInput,
    actor: Actor,
  ): Promise<Result<void, RestoreDevelopmentError>> {
    if (!actor.can('developments:delete')) return err({ type: 'Forbidden' });
    const parsed = DevelopmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreDevelopmentError>> => {
      const development = await findDevelopment(tx.developments, parsed.data.developmentId);
      if (!development) return err({ type: 'DevelopmentNotFound' });

      const restored = development.restoreFromTrash(now);
      if (restored.isErr()) return err(restored.error);

      await tx.developments.save(development, actor.id);
      await tx.events.publish(development.pullEvents());
      await tx.audit.record(
        auditAction(actor, developmentTarget('development.restored', development)),
      );
      return ok(undefined);
    });
  }
}

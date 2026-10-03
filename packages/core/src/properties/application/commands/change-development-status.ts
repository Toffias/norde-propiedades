import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  ChangeDevelopmentStatusInputSchema,
  type ChangeDevelopmentStatusInput,
} from '../../contracts';
import type {
  DevelopmentInTrashError,
  InvalidDevelopmentStatusTransitionError,
} from '../../domain/development';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type ChangeDevelopmentStatusError =
  EditDevelopmentError | DevelopmentInTrashError | InvalidDevelopmentStatusTransitionError;

/** Comercializando o cargando información. */
export class ChangeDevelopmentStatus {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangeDevelopmentStatusInput,
    actor: Actor,
  ): Promise<Result<void, ChangeDevelopmentStatusError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = ChangeDevelopmentStatusInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { developmentId, status } = parsed.data;
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, developmentId, {
      action: 'development.status_changed',
      apply: (development) => development.changeStatus(status, now),
    });
  }
}

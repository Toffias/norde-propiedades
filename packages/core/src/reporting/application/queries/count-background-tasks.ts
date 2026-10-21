import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { CountBackgroundTasksQuerySchema, type CountBackgroundTasksQuery } from '../../contracts';
import { backgroundTaskCriteria, type BackgroundTaskScopeError } from '../background-task-scope';
import { invalidInput, type InvalidInputError } from '../home-support';
import type { BackgroundTaskQuery } from '../ports/background-task-query';

export type CountBackgroundTasksError = BackgroundTaskScopeError | InvalidInputError;

/** El contador de la campana: cuántos procesos siguen en curso. */
export class CountBackgroundTasks {
  constructor(
    private readonly deps: { readonly tasks: BackgroundTaskQuery; readonly clock: Clock },
  ) {}

  async execute(
    input: CountBackgroundTasksQuery,
    actor: Actor,
  ): Promise<Result<{ readonly active: number }, CountBackgroundTasksError>> {
    const parsed = CountBackgroundTasksQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    // Los terminados no cuentan: la fecha no cambia el resultado.
    const criteria = backgroundTaskCriteria(parsed.data.scope, actor, this.deps.clock.now());
    if (criteria.isErr()) return err(criteria.error);
    return ok({ active: await this.deps.tasks.countActive(criteria.value) });
  }
}

import { err, ok, toOffsetLimit, type Actor, type Clock, type Result } from '../../../shared';
import {
  ListBackgroundTasksQuerySchema,
  type BackgroundTaskRow,
  type BackgroundTasksPage,
  type ListBackgroundTasksQuery,
} from '../../contracts';
import { finishedTasksSince, isSystemRequester } from '../../domain/background-tasks';
import { invalidInput, type InvalidInputError } from '../home-support';
import { backgroundTaskCriteria, type BackgroundTaskScopeError } from '../background-task-scope';
import type { BackgroundTaskQuery, BackgroundTaskRecord } from '../ports/background-task-query';
import type { ReportingUserNames } from '../ports/user-names';

export type ListBackgroundTasksError = BackgroundTaskScopeError | InvalidInputError;

/**
 * La campana de la barra superior: los procesos en segundo plano en curso y los terminados en la
 * última semana que no se limpiaron, los en curso primero.
 */
export class ListBackgroundTasks {
  constructor(
    private readonly deps: {
      readonly tasks: BackgroundTaskQuery;
      readonly users: ReportingUserNames;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListBackgroundTasksQuery,
    actor: Actor,
  ): Promise<Result<BackgroundTasksPage, ListBackgroundTasksError>> {
    const parsed = ListBackgroundTasksQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { scope, clearedAt, sort, ...page } = parsed.data;
    const since = finishedTasksSince(
      this.deps.clock.now(),
      clearedAt === undefined ? undefined : new Date(clearedAt),
    );
    const criteria = backgroundTaskCriteria(scope, actor, since);
    if (criteria.isErr()) return err(criteria.error);

    const [slice, active] = await Promise.all([
      this.deps.tasks.list(criteria.value, { direction: sort.direction, ...toOffsetLimit(page) }),
      this.deps.tasks.countActive(criteria.value),
    ]);
    return ok({
      items: await withRequesters(this.deps.users, slice.items),
      total: slice.total,
      page: page.page,
      pageSize: page.pageSize,
      active,
    });
  }
}

/** Cambia el `requesterId` de cada fila por quien lo pidió, con su nombre (o nadie, el sistema). */
async function withRequesters(
  users: ReportingUserNames,
  rows: readonly BackgroundTaskRecord[],
): Promise<BackgroundTaskRow[]> {
  const people = [
    ...new Set(rows.map((row) => row.requesterId).filter((id) => !isSystemRequester(id))),
  ];
  const names = people.length === 0 ? new Map<string, string>() : await users.names(people);
  return rows.map(({ requesterId, ...row }) => ({
    ...row,
    requester: isSystemRequester(requesterId)
      ? undefined
      : { id: requesterId, name: names.get(requesterId) },
  }));
}

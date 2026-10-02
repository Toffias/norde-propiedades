import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListClientImportsQuerySchema,
  type ClientImportRow,
  type ListClientImportsQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { toImportRows } from '../import-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientImportQuery } from '../ports/client-import-query';

export type ListClientImportsError = ForbiddenError | InvalidInputError;

/** El historial de importaciones de contactos, las más recientes primero. */
export class ListClientImports {
  constructor(
    private readonly deps: {
      readonly imports: ClientImportQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListClientImportsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientImportRow>, ListClientImportsError>> {
    if (!actor.can('clients:import')) return err({ type: 'Forbidden' });
    const parsed = ListClientImportsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort } = parsed.data;

    const slice = await this.deps.imports.list({
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toImportRows(this.deps.agents, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}

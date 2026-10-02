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
  ListClientSavedSearchesQuerySchema,
  type ClientSavedSearchRow,
  type ListClientSavedSearchesQuery,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findReadableClient } from '../record-support';

export type ListClientSavedSearchesError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/** Las búsquedas guardadas del contacto (sin las borradas), las actualizadas último primero. */
export class ListClientSavedSearches {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
    },
  ) {}

  async execute(
    input: ListClientSavedSearchesQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientSavedSearchRow>, ListClientSavedSearchesError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientSavedSearchesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await findReadableClient(this.deps.uow, actor, query.clientId);
    if (client.isErr()) return err(client.error);

    const { page, pageSize } = query;
    const slice = await this.deps.records.savedSearches({
      clientId: client.value.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}

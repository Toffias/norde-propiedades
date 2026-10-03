import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SavedSearchRefInputSchema, type SavedSearchRefInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  clientTarget,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  findClientSearch,
  findEditableClient,
  type SavedSearchNotFoundError,
} from '../saved-search-support';

export type DeleteSavedSearchError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | SavedSearchNotFoundError;

/** Manda una búsqueda del contacto a la papelera. Si ya estaba, no hace nada. */
export class DeleteSavedSearch {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SavedSearchRefInput,
    actor: Actor,
  ): Promise<Result<void, DeleteSavedSearchError>> {
    if (accessScope(actor, OWNERSHIP_RULES.clientsUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = SavedSearchRefInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteSavedSearchError>> => {
      const client = await findEditableClient(tx, actor, parsed.data.clientId);
      if (client.isErr()) return err(client.error);
      const search = await findClientSearch(tx, client.value, parsed.data.savedSearchId);
      if (!search) return err({ type: 'SavedSearchNotFound' });
      if (!search.delete(actor.id, now)) return ok(undefined);

      await tx.savedSearches.save(search, actor.id);
      await tx.audit.record(
        auditAction(actor, clientTarget('client.saved_search_deleted', client.value.id), {
          savedSearchId: { before: search.id, after: search.id },
        }),
      );
      return ok(undefined);
    });
  }
}

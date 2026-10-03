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
  checkSavedSearchLimit,
  type SavedSearchLimitReachedError,
} from '../../domain/saved-search';
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

export type RestoreSavedSearchError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | SavedSearchNotFoundError
  | SavedSearchLimitReachedError;

/**
 * Saca una búsqueda del contacto de la papelera, si todavía entra en su tope de búsquedas. Si no
 * estaba borrada, no hace nada.
 */
export class RestoreSavedSearch {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SavedSearchRefInput,
    actor: Actor,
  ): Promise<Result<void, RestoreSavedSearchError>> {
    if (accessScope(actor, OWNERSHIP_RULES.clientsUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = SavedSearchRefInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreSavedSearchError>> => {
      const client = await findEditableClient(tx, actor, parsed.data.clientId);
      if (client.isErr()) return err(client.error);
      const search = await findClientSearch(tx, client.value, parsed.data.savedSearchId);
      if (!search) return err({ type: 'SavedSearchNotFound' });
      if (!search.isDeleted) return ok(undefined);
      const limit = checkSavedSearchLimit(
        await tx.savedSearches.countActiveByClient(client.value.id),
      );
      if (limit.isErr()) return err(limit.error);

      search.restore(now);
      await tx.savedSearches.save(search, actor.id);
      await tx.audit.record(
        auditAction(actor, clientTarget('client.saved_search_restored', client.value.id), {
          savedSearchId: { before: search.id, after: search.id },
        }),
      );
      return ok(undefined);
    });
  }
}

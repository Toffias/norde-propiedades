import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateSavedSearchInputSchema, type UpdateSavedSearchInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import type {
  InvalidSavedSearchError,
  SavedSearchUnsubscribedError,
} from '../../domain/saved-search';
import {
  clientTarget,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { OpportunityNotFoundError } from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  checkSearchOpportunity,
  findClientSearch,
  findEditableClient,
  savedSearchAuditState,
  toSavedSearchFields,
  type SavedSearchNotFoundError,
} from '../saved-search-support';

export type UpdateSavedSearchError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | SavedSearchNotFoundError
  | OpportunityNotFoundError
  | InvalidSavedSearchError
  | SavedSearchUnsubscribedError;

/**
 * Reemplaza los criterios de una búsqueda vigente del contacto. Si no cambió nada, no escribe ni
 * audita; si cambió, el historial del contacto guarda solo los campos que cambiaron.
 */
export class UpdateSavedSearch {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateSavedSearchInput,
    actor: Actor,
  ): Promise<Result<void, UpdateSavedSearchError>> {
    if (accessScope(actor, OWNERSHIP_RULES.clientsUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = UpdateSavedSearchInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateSavedSearchError>> => {
      const client = await findEditableClient(tx, actor, parsed.data.clientId);
      if (client.isErr()) return err(client.error);
      const search = await findClientSearch(tx, client.value, parsed.data.savedSearchId);
      if (!search || search.isDeleted) return err({ type: 'SavedSearchNotFound' });

      const fields = toSavedSearchFields(parsed.data);
      // Una búsqueda que ya estaba atada a una oportunidad que se cerró puede seguir así.
      if (fields.opportunityId !== search.fields.opportunityId) {
        const opportunity = await checkSearchOpportunity(tx, client.value, fields.opportunityId);
        if (opportunity.isErr()) return err(opportunity.error);
      }
      const before = savedSearchAuditState(search);
      const edited = search.edit(fields, now);
      if (edited.isErr()) return err(edited.error);
      if (!edited.value) return ok(undefined);

      await tx.savedSearches.save(search, actor.id);
      const entry = auditUpdated(
        actor,
        clientTarget('client.saved_search_updated', client.value.id),
        { savedSearchId: search.id, ...before },
        { savedSearchId: search.id, ...savedSearchAuditState(search) },
      );
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

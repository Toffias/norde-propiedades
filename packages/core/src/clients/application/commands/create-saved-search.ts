import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  CreateSavedSearchInputSchema,
  type CreateSavedSearchInput,
  type CreateSavedSearchOutput,
} from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  checkSavedSearchLimit,
  SavedSearch,
  type InvalidSavedSearchError,
  type SavedSearchLimitReachedError,
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
  findEditableClient,
  savedSearchAuditState,
  toSavedSearchFields,
} from '../saved-search-support';

export type CreateSavedSearchError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | OpportunityNotFoundError
  | InvalidSavedSearchError
  | SavedSearchLimitReachedError;

/**
 * Guarda una búsqueda para un contacto (opcionalmente atada a una de sus oportunidades abiertas).
 * Lo hace quien puede editar el contacto y queda en su historial.
 */
export class CreateSavedSearch {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateSavedSearchInput,
    actor: Actor,
  ): Promise<Result<CreateSavedSearchOutput, CreateSavedSearchError>> {
    if (accessScope(actor, OWNERSHIP_RULES.clientsUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = CreateSavedSearchInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateSavedSearchOutput, CreateSavedSearchError>> => {
        const client = await findEditableClient(tx, actor, parsed.data.clientId);
        if (client.isErr()) return err(client.error);
        const fields = toSavedSearchFields(parsed.data);
        const opportunity = await checkSearchOpportunity(tx, client.value, fields.opportunityId);
        if (opportunity.isErr()) return err(opportunity.error);
        const limit = checkSavedSearchLimit(
          await tx.savedSearches.countActiveByClient(client.value.id),
        );
        if (limit.isErr()) return err(limit.error);

        const created = SavedSearch.create({
          id: nextId<'SavedSearch'>(this.deps.ids),
          clientId: client.value.id,
          fields,
          now,
        });
        if (created.isErr()) return err(created.error);
        const search = created.value;

        await tx.savedSearches.save(search, actor.id);
        await tx.audit.record(
          auditCreated(actor, clientTarget('client.saved_search_created', client.value.id), {
            savedSearchId: search.id,
            ...savedSearchAuditState(search),
          }),
        );
        return ok({ savedSearchId: search.id });
      },
    );
  }
}

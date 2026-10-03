import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  SavedSearchRefInputSchema,
  type SavedSearchDetail,
  type SavedSearchLocationLabel,
  type SavedSearchRefInput,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { SavedSearchLocations } from '../ports/saved-search-locations';
import { findReadableClient } from '../record-support';
import { findClientSearch, type SavedSearchNotFoundError } from '../saved-search-support';

export type GetSavedSearchError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | SavedSearchNotFoundError;

/** Una búsqueda del contacto para el panel de edición, con los nombres de sus ubicaciones. */
export class GetSavedSearch {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly locations: SavedSearchLocations;
    },
  ) {}

  async execute(
    input: SavedSearchRefInput,
    actor: Actor,
  ): Promise<Result<SavedSearchDetail, GetSavedSearchError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });
    const parsed = SavedSearchRefInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const client = await findReadableClient(this.deps.uow, actor, parsed.data.clientId);
    if (client.isErr()) return err(client.error);
    const search = await this.deps.uow.run((tx) =>
      findClientSearch(tx, client.value, parsed.data.savedSearchId),
    );
    if (!search) return err({ type: 'SavedSearchNotFound' });

    const s = search.toSnapshot();
    const labels: ReadonlyMap<string, SavedSearchLocationLabel> =
      s.locationIds.length === 0
        ? new Map()
        : await this.deps.locations.labels(s.locationIds, actor);
    return ok({
      id: s.id,
      clientId: s.clientId,
      name: s.name,
      opportunityId: s.opportunityId,
      operation: s.operation,
      propertyTypes: s.propertyTypes,
      currency: s.currency,
      minPriceCents: s.minPriceCents,
      maxPriceCents: s.maxPriceCents,
      locations: s.locationIds.flatMap((id) => {
        const label = labels.get(id);
        return label ? [label] : [];
      }),
      minRooms: s.minRooms,
      autoSend: s.autoSend,
      unsubscribed: s.unsubscribedAt !== undefined,
      deleted: s.deletedAt !== undefined,
    });
  }
}

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
  ListClientFeaturedQuerySchema,
  type ClientFeaturedRow,
  type ListClientFeaturedQuery,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListings, ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findReadableClient, userNames, userRef } from '../record-support';

export type ListClientFeaturedError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * Las propiedades destacadas vigentes del contacto, las últimas primero, con lo que se muestra de
 * cada una (lo da el módulo properties). Una que ya no está en la cartera queda sin datos.
 */
export class ListClientFeatured {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
      readonly listings: ClientListings;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListClientFeaturedQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientFeaturedRow>, ListClientFeaturedError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientFeaturedQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await findReadableClient(this.deps.uow, actor, query.clientId);
    if (client.isErr()) return err(client.error);

    const { page, pageSize } = query;
    const slice = await this.deps.records.featured({
      clientId: client.value.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const [listings, names] = await Promise.all([
      this.deps.listings.summaries(
        slice.items.map((item) => item.propertyId),
        actor,
      ),
      userNames(
        this.deps.agents,
        slice.items.map((item) => item.featuredBy),
      ),
    ]);
    const items = slice.items.map(({ featuredBy, ...item }): ClientFeaturedRow => ({
      ...item,
      property: listings.get(item.propertyId),
      featuredBy: userRef(featuredBy, names),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}

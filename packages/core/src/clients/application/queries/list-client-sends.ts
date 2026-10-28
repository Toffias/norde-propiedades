import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListClientSendsQuerySchema,
  type ClientSendRow,
  type ListClientSendsQuery,
} from '../../contracts';
import { sharedListingAvailability } from '../../domain/shared-listing';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListings } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { ClientSendsQuery } from '../ports/shared-listing-ports';
import { canWorkOn, findReadableClient, userNames } from '../record-support';

export type ListClientSendsError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * Los envíos de propiedades al contacto, los últimos primero: por dónde, quién, si lo abrió, qué
 * le gustó y si el link sigue vigente. Lo ve quien ve el contacto; revoca quien lo puede editar.
 */
export class ListClientSends {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly sends: ClientSendsQuery;
      readonly listings: ClientListings;
      readonly agents: ClientAgents;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListClientSendsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientSendRow>, ListClientSendsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientSendsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await findReadableClient(this.deps.uow, actor, query.clientId);
    if (client.isErr()) return err(client.error);

    const { page, pageSize } = query;
    const slice = await this.deps.sends.sends({
      clientId: client.value.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const [listings, names] = await Promise.all([
      this.deps.listings.summaries(
        [...new Set(slice.items.flatMap((item) => item.properties.map((p) => p.id)))],
        actor,
      ),
      userNames(
        this.deps.agents,
        slice.items.map((item) => item.sentBy),
      ),
    ]);
    const now = this.deps.clock.now();
    const canRevoke = canWorkOn(actor, client.value);
    const items = slice.items.map((item): ClientSendRow => {
      const status = sharedListingAvailability(item, now);
      return {
        id: item.id,
        channel: item.channel,
        sentAt: item.sentAt,
        sentBy: { id: item.sentBy, name: names.get(item.sentBy) },
        expiresAt: item.expiresAt,
        status,
        properties: item.properties.map((property) => ({
          ...property,
          code: listings.get(property.id)?.code,
        })),
        firstOpenedAt: item.firstOpenedAt,
        openCount: item.openCount,
        can: { revoke: canRevoke && status === 'available' },
      };
    });
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}

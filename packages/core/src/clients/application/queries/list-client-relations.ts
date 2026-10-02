import { canActOn, OWNERSHIP_RULES } from '../../../identity';
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
  ListClientRelationsQuerySchema,
  type ClientRelationRow,
  type ListClientRelationsQuery,
} from '../../contracts';
import {
  canReadClients,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientRelationQuery } from '../ports/client-relation-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ListClientRelationsError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * Los contactos relacionados de la ficha, en los dos sentidos ("trabaja en Acme" y, en la ficha
 * de Acme, "Juan trabaja acá"), paginados por nombre.
 */
export class ListClientRelations {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly relations: ClientRelationQuery;
    },
  ) {}

  async execute(
    input: ListClientRelationsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientRelationRow>, ListClientRelationsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientRelationsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await this.deps.uow.run((tx) => findClient(tx.clients, query.clientId));
    if (!client) return err({ type: 'ClientNotFound' });
    const update = OWNERSHIP_RULES.clientsUpdate;
    const read = OWNERSHIP_RULES.clientsRead;
    if (!canActOn(actor, read, client.ownership)) return err({ type: 'Forbidden' });
    const editsThis = !client.isDeleted && canActOn(actor, update, client.ownership);

    const { page, pageSize } = query;
    const slice = await this.deps.relations.list({
      clientId: client.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = slice.items.map(({ other, ...item }): ClientRelationRow => {
      const ownership = { ownerId: other.agentId, ownerBranchId: other.branchId };
      return {
        ...item,
        other: { id: other.id, name: other.name, kind: other.kind },
        canOpen: canActOn(actor, read, ownership),
        canUnlink: !client.isDeleted && (editsThis || canActOn(actor, update, ownership)),
      };
    });
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}

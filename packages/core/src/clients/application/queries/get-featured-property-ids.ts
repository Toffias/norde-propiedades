import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { FeaturedPropertyIdsInputSchema, type FeaturedPropertyIdsInput } from '../../contracts';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findReadableClient } from '../record-support';

export type GetFeaturedPropertyIdsError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * Cuáles de las propiedades de una página del buscador ya le destacaron al contacto (para marcar
 * "Destacada" en vez del botón).
 */
export class GetFeaturedPropertyIds {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
    },
  ) {}

  async execute(
    input: FeaturedPropertyIdsInput,
    actor: Actor,
  ): Promise<Result<ReadonlySet<string>, GetFeaturedPropertyIdsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = FeaturedPropertyIdsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const client = await findReadableClient(this.deps.uow, actor, parsed.data.clientId);
    if (client.isErr()) return err(client.error);
    if (parsed.data.propertyIds.length === 0) return ok(new Set());

    const ids = parsed.data.propertyIds.map((id) => id.toLowerCase());
    return ok(new Set(await this.deps.records.featuredPropertyIds(client.value.id, ids)));
  }
}

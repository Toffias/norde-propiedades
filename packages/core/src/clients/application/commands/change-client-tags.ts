import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditUpdated,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ChangeClientTagsInputSchema, type ChangeClientTagsInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { ClientTagNotFoundError } from '../tag-support';

export type ChangeClientTagsError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | ClientTagNotFoundError;

/** Las etiquetas de la ficha: recibe las que quedan. Las edita quien puede editar el contacto. */
export class ChangeClientTags {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ChangeClientTagsInput,
    actor: Actor,
  ): Promise<Result<void, ChangeClientTagsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = ChangeClientTagsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const wanted = [...new Set(parsed.data.tagIds)];
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ChangeClientTagsError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
      const existing = await tx.tags.findExistingIds(wanted);
      if (existing.length !== wanted.length) return err({ type: 'TagNotFound' });

      // Ordenadas: el orden en que se marcaron no es un cambio.
      const before = { tagIds: toAuditValue([...client.tagIds].sort()) };
      const changed = client.changeTags(wanted, now);
      if (changed.isErr()) return err(changed.error);
      const entry = auditUpdated(actor, clientTarget('client.tags_changed', client.id), before, {
        tagIds: toAuditValue([...client.tagIds].sort()),
      });
      if (!changed.value || entry === undefined) return ok(undefined);

      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

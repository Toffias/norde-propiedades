import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { LinkClientsInputSchema, type LinkClientsInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import type {
  InvalidRelationError,
  SelfRelationError,
  TooManyRelationsError,
} from '../../domain/client-relation';
import {
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type LinkClientsError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | SelfRelationError
  | InvalidRelationError
  | TooManyRelationsError;

/**
 * Relaciona dos contactos: la persona trabaja en una empresa, es miembro de un grupo o está
 * relacionada con otro contacto. La declara el contacto que se edita (hay que poder editarlo) y
 * el otro tiene que ser visible para el actor. Se audita contra el que la declara, con los dos IDs.
 */
export class LinkClients {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: LinkClientsInput, actor: Actor): Promise<Result<void, LinkClientsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = LinkClientsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { clientId, relatedClientId, kind, label } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, LinkClientsError>> => {
      const client = await findClient(tx.clients, clientId);
      const related = await findClient(tx.clients, relatedClientId);
      if (!client || !related) return err({ type: 'ClientNotFound' });
      if (
        !canActOn(actor, rule, client.ownership) ||
        !canActOn(actor, OWNERSHIP_RULES.clientsRead, related.ownership)
      ) {
        return err({ type: 'Forbidden' });
      }

      const before = client.relations.find(
        (r) => r.relatedClientId === related.id && r.kind === kind,
      );
      const linked = client.link(
        { id: related.id, kind: related.kind, isDeleted: related.isDeleted },
        kind,
        label,
        now,
      );
      if (linked.isErr()) return err(linked.error);
      if (!linked.value) return ok(undefined);
      const after = client.relations.find(
        (r) => r.relatedClientId === related.id && r.kind === kind,
      );

      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          {
            action: before ? 'client.relation_updated' : 'client.linked',
            entityType: 'client',
            entityId: client.id,
            clientIds: [client.id, related.id],
          },
          {
            relatedClientId: { before: before ? related.id : null, after: related.id },
            relationKind: { before: before ? kind : null, after: kind },
            relationLabel: { before: before?.label ?? null, after: after?.label ?? null },
          },
        ),
      );
      return ok(undefined);
    });
  }
}

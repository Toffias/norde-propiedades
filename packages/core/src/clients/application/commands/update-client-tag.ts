import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateClientTagInputSchema, type UpdateClientTagInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagAuditState,
  findTag,
  resolveTagGroup,
  tagCatalogTarget,
  type ClientTagGroupNotFoundError,
  type ClientTagNameTakenError,
  type ClientTagNotFoundError,
} from '../tag-support';

export type UpdateClientTagError =
  | ForbiddenError
  | InvalidInputError
  | ClientTagNotFoundError
  | ClientTagGroupNotFoundError
  | ClientTagNameTakenError;

/** Renombra una etiqueta o la mueve a otro grupo. Los contactos que la tienen la conservan. */
export class UpdateClientTag {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateClientTagInput,
    actor: Actor,
  ): Promise<Result<void, UpdateClientTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateClientTagInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { tagId, groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateClientTagError>> => {
      const tag = await findTag(tx, tagId);
      if (!tag) return err({ type: 'TagNotFound' });
      const group = await resolveTagGroup(tx, groupId);
      if (group === undefined) return err({ type: 'TagGroupNotFound' });
      const sameName = await tx.tags.findInGroup(group ?? undefined, name);
      if (sameName && sameName.id !== tag.id) return err({ type: 'TagNameTaken' });

      const before = clientTagAuditState(tag);
      tag.update({ name, groupId: group ?? undefined }, now);
      const entry = auditUpdated(
        actor,
        tagCatalogTarget('client_tag', 'client_tag.updated', tag.id),
        before,
        clientTagAuditState(tag),
      );
      if (!entry) return ok(undefined);

      await tx.tags.save(tag, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

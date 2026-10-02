import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RenameClientTagGroupInputSchema, type RenameClientTagGroupInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagGroupAuditState,
  findTagGroup,
  tagCatalogTarget,
  type ClientTagGroupNameTakenError,
  type ClientTagGroupNotFoundError,
} from '../tag-support';

export type RenameClientTagGroupError =
  ForbiddenError | InvalidInputError | ClientTagGroupNotFoundError | ClientTagGroupNameTakenError;

export class RenameClientTagGroup {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: RenameClientTagGroupInput,
    actor: Actor,
  ): Promise<Result<void, RenameClientTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = RenameClientTagGroupInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RenameClientTagGroupError>> => {
      const group = await findTagGroup(tx, groupId);
      if (!group) return err({ type: 'TagGroupNotFound' });
      const sameName = await tx.tagGroups.findByName(name);
      if (sameName && sameName.id !== group.id) return err({ type: 'TagGroupNameTaken' });

      const before = clientTagGroupAuditState(group);
      group.rename(name, now);
      const entry = auditUpdated(
        actor,
        tagCatalogTarget('client_tag_group', 'client_tag_group.updated', group.id),
        before,
        clientTagGroupAuditState(group),
      );
      if (!entry) return ok(undefined);

      await tx.tagGroups.save(group, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

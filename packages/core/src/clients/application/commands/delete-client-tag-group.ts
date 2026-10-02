import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ClientTagGroupIdInputSchema, type ClientTagGroupIdInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagGroupAuditState,
  findTagGroup,
  tagCatalogTarget,
  type ClientTagGroupNotEmptyError,
  type ClientTagGroupNotFoundError,
} from '../tag-support';

export type DeleteClientTagGroupError =
  ForbiddenError | InvalidInputError | ClientTagGroupNotFoundError | ClientTagGroupNotEmptyError;

/**
 * Borra un grupo vacío. Es configuración: se borra de verdad y la auditoría guarda cómo era. Un
 * grupo con etiquetas no se borra: primero se mueven o se borran.
 */
export class DeleteClientTagGroup {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: ClientTagGroupIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteClientTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = ClientTagGroupIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteClientTagGroupError>> => {
      const group = await findTagGroup(tx, parsed.data.groupId);
      if (!group) return err({ type: 'TagGroupNotFound' });
      if ((await tx.tagGroups.countTags(group.id)) > 0) return err({ type: 'TagGroupNotEmpty' });

      await tx.tagGroups.delete(group.id);
      await tx.audit.record(
        auditAction(
          actor,
          tagCatalogTarget('client_tag_group', 'client_tag_group.deleted', group.id),
          diffChanges(clientTagGroupAuditState(group), {}),
        ),
      );
      return ok(undefined);
    });
  }
}

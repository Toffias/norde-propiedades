import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ClientTagIdInputSchema, type ClientTagIdInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  clientTagAuditState,
  findTag,
  tagCatalogTarget,
  type ClientTagInUseError,
  type ClientTagNotFoundError,
} from '../tag-support';

export type DeleteClientTagError =
  ForbiddenError | InvalidInputError | ClientTagNotFoundError | ClientTagInUseError;

/**
 * Borra una etiqueta que ningún contacto tiene. Es configuración: se borra de verdad y la
 * auditoría guarda cómo era. Una en uso se unifica con otra o se quita de los contactos.
 */
export class DeleteClientTag {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: ClientTagIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteClientTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = ClientTagIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteClientTagError>> => {
      const tag = await findTag(tx, parsed.data.tagId);
      if (!tag) return err({ type: 'TagNotFound' });
      const uses = await tx.tags.countUses(tag.id);
      if (uses > 0) return err({ type: 'TagInUse', uses });

      await tx.tags.delete(tag.id);
      await tx.audit.record(
        auditAction(
          actor,
          tagCatalogTarget('client_tag', 'client_tag.deleted', tag.id),
          diffChanges(clientTagAuditState(tag), {}),
        ),
      );
      return ok(undefined);
    });
  }
}

import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { MergeClientTagsInputSchema, type MergeClientTagsInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findTag, tagCatalogTarget, type ClientTagNotFoundError } from '../tag-support';

export type MergeClientTagsError = ForbiddenError | InvalidInputError | ClientTagNotFoundError;

/**
 * Unifica dos etiquetas: los contactos de la de origen pasan a la de destino (quien tenía las dos
 * queda con una) y la de origen se borra. Se audita contra la de destino, con cuántos contactos
 * la tenían: para cada contacto es la misma etiqueta con otro nombre.
 */
export class MergeClientTags {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: MergeClientTagsInput,
    actor: Actor,
  ): Promise<Result<{ readonly moved: number }, MergeClientTagsError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = MergeClientTagsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { sourceTagId, targetTagId } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly moved: number }, MergeClientTagsError>> => {
        const source = await findTag(tx, sourceTagId);
        const target = await findTag(tx, targetTagId);
        if (!source || !target) return err({ type: 'TagNotFound' });

        const moved = await tx.tags.moveAssignments(source.id, target.id, actor.id, now);
        await tx.tags.delete(source.id);
        const s = source.toSnapshot();
        await tx.audit.record(
          auditAction(actor, tagCatalogTarget('client_tag', 'client_tag.merged', target.id), {
            mergedTagId: { before: s.id, after: null },
            mergedTagName: { before: s.name, after: null },
            mergedTagGroupId: { before: s.groupId ?? null, after: null },
            clients: { before: null, after: moved },
          }),
        );
        return ok({ moved });
      },
    );
  }
}

import {
  auditAction,
  diffChanges,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { MergeClientTagsInputSchema, type MergeClientTagsInput } from '../../contracts';
import { mergeTagIds } from '../../domain/client-tag';
import { clientTarget, invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findTag, tagCatalogTarget, type ClientTagNotFoundError } from '../tag-support';

export type MergeClientTagsError = ForbiddenError | InvalidInputError | ClientTagNotFoundError;

/** Contactos por consulta: la agenda se recorre de a lotes, sin cargarla entera en memoria. */
export const MERGE_CLIENT_TAGS_BATCH_SIZE = 200;

/**
 * Unifica dos etiquetas: los contactos de la de origen pasan a la de destino (quien tenía las dos
 * queda con una) y la de origen se borra. Se audita contra la de destino, con cuántos contactos
 * la tenían, y contra cada contacto, para que el cambio aparezca en su historial. Todo en una
 * transacción: la unificación no queda a medias.
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

        let moved = 0;
        for (;;) {
          const batch = await tx.tags.moveAssignments(
            source.id,
            target.id,
            MERGE_CLIENT_TAGS_BATCH_SIZE,
            actor.id,
            now,
          );
          for (const { clientId, tagIdsBefore } of batch) {
            // Ordenadas, como en ChangeClientTags: el orden no es un cambio.
            const before = [...tagIdsBefore].sort();
            const after = [...mergeTagIds(tagIdsBefore, source.id, target.id)].sort();
            await tx.audit.record(
              auditAction(
                actor,
                clientTarget('client.tags_changed', clientId),
                diffChanges({ tagIds: toAuditValue(before) }, { tagIds: toAuditValue(after) }),
              ),
            );
          }
          moved += batch.length;
          if (batch.length < MERGE_CLIENT_TAGS_BATCH_SIZE) break;
        }

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

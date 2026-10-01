import {
  auditAction,
  diffChanges,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  DeleteReferenceCodeSequenceInputSchema,
  type DeleteReferenceCodeSequenceInput,
} from '../../contracts';
import type { ReferenceCodeSequenceError } from '../../domain/reference-code-sequence';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

import { sequenceAuditState, sequenceTarget } from '../reference-code-sequence-audit';

export type DeleteReferenceCodeSequenceError =
  | ForbiddenError
  | ValidationFailedError
  | ReferenceCodeSequenceError
  | { readonly type: 'NotFound' };

/**
 * Borra una numeración: las altas siguientes usan la que corresponda después en la prioridad. Los
 * códigos ya entregados no cambian.
 */
export class DeleteReferenceCodeSequence {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(
    input: DeleteReferenceCodeSequenceInput,
    actor: Actor,
  ): Promise<Result<void, DeleteReferenceCodeSequenceError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(DeleteReferenceCodeSequenceInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'ReferenceCodeSequence'>(parsed.value.sequenceId);
    if (id.isErr()) return err({ type: 'NotFound' });

    return this.deps.uow.run(
      async (tx): Promise<Result<void, DeleteReferenceCodeSequenceError>> => {
        const sequence = await tx.sequences.findById(id.value);
        if (!sequence) return err({ type: 'NotFound' });
        const removable = sequence.ensureRemovable();
        if (removable.isErr()) return err(removable.error);

        await tx.sequences.delete(sequence.id);
        await tx.audit.record(
          auditAction(
            actor,
            sequenceTarget(sequence, 'reference_code_sequence.deleted'),
            diffChanges(sequenceAuditState(sequence), {}),
          ),
        );
        return ok(undefined);
      },
    );
  }
}

import {
  auditUpdated,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ChangeReferenceCodePrefixInputSchema,
  type ChangeReferenceCodePrefixInput,
} from '../../contracts';
import {
  ReferenceCodePrefix,
  type InvalidReferenceCodePrefixError,
} from '../../domain/reference-code';
import type { ReferenceCodeSequenceError } from '../../domain/reference-code-sequence';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

import { sequenceAuditState, sequenceTarget } from '../reference-code-sequence-audit';

export type ChangeReferenceCodePrefixError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidReferenceCodePrefixError
  | ReferenceCodeSequenceError
  | { readonly type: 'NotFound' };

/** Cambia el prefijo de una numeración. Los códigos ya entregados no cambian. */
export class ChangeReferenceCodePrefix {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(
    input: ChangeReferenceCodePrefixInput,
    actor: Actor,
  ): Promise<Result<void, ChangeReferenceCodePrefixError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ChangeReferenceCodePrefixInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'ReferenceCodeSequence'>(parsed.value.sequenceId);
    if (id.isErr()) return err({ type: 'NotFound' });
    const prefix = ReferenceCodePrefix.create(parsed.value.prefix);
    if (prefix.isErr()) return err(prefix.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, ChangeReferenceCodePrefixError>> => {
      const sequence = await tx.sequences.findById(id.value);
      if (!sequence) return err({ type: 'NotFound' });
      const before = sequenceAuditState(sequence);
      const samePrefix = await tx.sequences.findByPrefix(prefix.value);
      const changed = sequence.changePrefix(prefix.value, samePrefix ? [samePrefix] : []);
      if (changed.isErr()) return err(changed.error);

      const entry = auditUpdated(
        actor,
        sequenceTarget(sequence, 'reference_code_sequence.updated'),
        before,
        sequenceAuditState(sequence),
      );
      if (!entry) return ok(undefined);
      await tx.sequences.save(sequence, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

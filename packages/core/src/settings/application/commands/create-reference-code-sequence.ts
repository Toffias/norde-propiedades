import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  CreateReferenceCodeSequenceInputSchema,
  type CreateReferenceCodeSequenceInput,
} from '../../contracts';
import {
  ReferenceCodePrefix,
  type InvalidReferenceCodePrefixError,
} from '../../domain/reference-code';
import {
  ReferenceCodeSequence,
  type ReferenceCodeSequenceError,
} from '../../domain/reference-code-sequence';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

import { sequenceAuditState, sequenceTarget } from '../reference-code-sequence-audit';

export type CreateReferenceCodeSequenceError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidReferenceCodePrefixError
  | ReferenceCodeSequenceError;

/** Agrega una numeración: un prefijo para un tipo de propiedad, o uno exclusivo. */
export class CreateReferenceCodeSequence {
  constructor(
    private readonly deps: { readonly uow: SettingsUnitOfWork; readonly ids: IdGenerator },
  ) {}

  async execute(
    input: CreateReferenceCodeSequenceInput,
    actor: Actor,
  ): Promise<Result<{ readonly sequenceId: string }, CreateReferenceCodeSequenceError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(CreateReferenceCodeSequenceInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const prefix = ReferenceCodePrefix.create(parsed.value.prefix);
    if (prefix.isErr()) return err(prefix.error);
    const key = { scope: parsed.value.scope, scopeValue: parsed.value.scopeValue };

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<{ readonly sequenceId: string }, CreateReferenceCodeSequenceError>> => {
        const samePrefix = await tx.sequences.findByPrefix(prefix.value);
        const sameScope = await tx.sequences.findByScopes([key]);
        const created = ReferenceCodeSequence.create({
          id: nextId<'ReferenceCodeSequence'>(this.deps.ids),
          key,
          prefix: prefix.value,
          conflicts: [...sameScope, ...(samePrefix ? [samePrefix] : [])],
        });
        if (created.isErr()) return err(created.error);
        const sequence = created.value;

        await tx.sequences.save(sequence);
        await tx.audit.record(
          auditCreated(
            actor,
            sequenceTarget(sequence, 'reference_code_sequence.created'),
            sequenceAuditState(sequence),
          ),
        );
        return ok({ sequenceId: sequence.id });
      },
    );
  }
}

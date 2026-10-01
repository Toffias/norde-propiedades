import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  DeleteStoredMediaFilesInputSchema,
  type DeleteStoredMediaFilesInput,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../property-support';

export type DeleteStoredMediaFilesError = ForbiddenError | InvalidInputError;

/** Lo corre el job de `MediaDeleted`: borra del storage la original y las variantes. */
export class DeleteStoredMediaFiles {
  constructor(private readonly deps: { readonly storage: FileStorage }) {}

  async execute(
    input: DeleteStoredMediaFilesInput,
    actor: Actor,
  ): Promise<Result<void, DeleteStoredMediaFilesError>> {
    if (!actor.can('properties:process-media')) return err({ type: 'Forbidden' });
    const parsed = DeleteStoredMediaFilesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    for (const key of parsed.data.storageKeys) await this.deps.storage.delete(key);
    return ok(undefined);
  }
}

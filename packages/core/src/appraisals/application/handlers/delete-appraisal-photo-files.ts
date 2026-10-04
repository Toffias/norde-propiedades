import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  DeleteAppraisalPhotoFilesInputSchema,
  type DeleteAppraisalPhotoFilesInput,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../appraisal-support';

export type DeleteAppraisalPhotoFilesError = ForbiddenError | InvalidInputError;

/** Lo corre el job de `AppraisalPhotoDeleted`: borra del storage la foto que se sacó. */
export class DeleteAppraisalPhotoFiles {
  constructor(private readonly deps: { readonly storage: FileStorage }) {}

  async execute(
    input: DeleteAppraisalPhotoFilesInput,
    actor: Actor,
  ): Promise<Result<void, DeleteAppraisalPhotoFilesError>> {
    if (!actor.can('appraisals:process-photos')) return err({ type: 'Forbidden' });
    const parsed = DeleteAppraisalPhotoFilesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    for (const key of parsed.data.storageKeys) await this.deps.storage.delete(key);
    return ok(undefined);
  }
}

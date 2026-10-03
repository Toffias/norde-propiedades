import { err, type Actor, type Clock, type Result } from '../../../shared';
import { ChangeDevelopmentTagsInputSchema, type ChangeDevelopmentTagsInput } from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import type { TagNotFoundError } from '../catalog-support';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type ChangeDevelopmentTagsError =
  EditDevelopmentError | DevelopmentInTrashError | TagNotFoundError;

/** Las etiquetas del emprendimiento (catálogo de propiedades): recibe las que quedan. */
export class ChangeDevelopmentTags {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangeDevelopmentTagsInput,
    actor: Actor,
  ): Promise<Result<void, ChangeDevelopmentTagsError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = ChangeDevelopmentTagsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const wanted = [...new Set(parsed.data.tagIds)];
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, parsed.data.developmentId, {
      action: 'development.tags_changed',
      apply: async (development, tx): Promise<Result<boolean, ChangeDevelopmentTagsError>> => {
        const existing = await tx.tags.findExistingIds(wanted);
        if (existing.length !== wanted.length) return err({ type: 'TagNotFound' });
        return development.setTags(wanted, now);
      },
    });
  }
}

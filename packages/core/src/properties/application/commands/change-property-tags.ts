import { err, type Actor, type Clock, type Result } from '../../../shared';
import { ChangePropertyTagsInputSchema, type ChangePropertyTagsInput } from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { TagNotFoundError } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type ChangePropertyTagsError = EditPropertyError | PropertyInTrashError | TagNotFoundError;

/** Las etiquetas de la ficha: recibe las que quedan y suma o quita la diferencia. */
export class ChangePropertyTags {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangePropertyTagsInput,
    actor: Actor,
  ): Promise<Result<void, ChangePropertyTagsError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ChangePropertyTagsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId } = parsed.data;
    const wanted = [...new Set(parsed.data.tagIds)];
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      action: 'property.tags_changed',
      apply: async (property, tx): Promise<Result<boolean, ChangePropertyTagsError>> => {
        const existing = await tx.tags.findExistingIds(wanted);
        if (existing.length !== wanted.length) return err({ type: 'TagNotFound' });
        const keep = new Set(wanted);
        return property.changeTags(
          { add: wanted, remove: property.tagIds.filter((id) => !keep.has(id)) },
          now,
        );
      },
    });
  }
}

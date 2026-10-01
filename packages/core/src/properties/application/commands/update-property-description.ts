import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyDescriptionInputSchema,
  type UpdatePropertyDescriptionInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyDescriptionError = EditPropertyError | PropertyInTrashError;

/** Título para portales y descripción. */
export class UpdatePropertyDescription {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyDescriptionInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyDescriptionError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyDescriptionInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, portalTitle, description } = parsed.data;
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: (property) => property.updateDescription({ portalTitle, description }, now),
    });
  }
}

import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyPublicationInputSchema,
  type UpdatePropertyPublicationInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { Publication } from '../../domain/property-details';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyPublicationError = EditPropertyError | PropertyInTrashError;

/**
 * "Publicar en web" (con o sin precio), destacada y dirección exacta: requiere
 * `properties:publish`, además de poder editar la propiedad.
 */
export class UpdatePropertyPublication {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyPublicationInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyPublicationError>> {
    if (!canEditProperties(actor) || !actor.can('properties:publish')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = UpdatePropertyPublicationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, ...fields } = parsed.data;
    const change: Partial<Publication> = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      action: 'property.publication_changed',
      apply: (property) => property.updatePublication(change, now),
    });
  }
}

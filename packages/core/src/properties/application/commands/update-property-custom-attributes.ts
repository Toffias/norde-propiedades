import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyCustomAttributesInputSchema,
  type UpdatePropertyCustomAttributesInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import {
  validateCustomAttributes,
  type CustomAttributeNotFoundError,
  type InvalidCustomAttributeValueError,
} from '../../domain/property-details';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyCustomAttributesError =
  | EditPropertyError
  | PropertyInTrashError
  | CustomAttributeNotFoundError
  | InvalidCustomAttributeValueError;

/** Valores de los atributos personalizados de Mi empresa, validados contra su definición. */
export class UpdatePropertyCustomAttributes {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyCustomAttributesInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyCustomAttributesError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyCustomAttributesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, values } = parsed.data;
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: async (
        property,
        tx,
      ): Promise<Result<boolean, UpdatePropertyCustomAttributesError>> => {
        const definitions = await tx.customAttributes.findByIds(values.map((v) => v.attributeId));
        const valid = validateCustomAttributes(
          values,
          definitions.map((definition) => definition.toDefinition()),
        );
        if (valid.isErr()) return err(valid.error);
        return property.updateCustomAttributes(valid.value, now);
      },
    });
  }
}

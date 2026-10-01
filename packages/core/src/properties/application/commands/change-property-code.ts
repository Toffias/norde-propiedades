import { err, type Actor, type Clock, type Result } from '../../../shared';
import { ChangePropertyCodeInputSchema, type ChangePropertyCodeInput } from '../../contracts';
import type { InvalidReferenceCodeError, PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export interface ReferenceCodeTakenError {
  readonly type: 'ReferenceCodeTaken';
}

export type ChangePropertyCodeError =
  EditPropertyError | PropertyInTrashError | InvalidReferenceCodeError | ReferenceCodeTakenError;

/** Cambia el código de referencia a mano (§4.6). No puede repetir el de otra propiedad. */
export class ChangePropertyCode {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangePropertyCodeInput,
    actor: Actor,
  ): Promise<Result<void, ChangePropertyCodeError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ChangePropertyCodeInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId } = parsed.data;
    const code = parsed.data.code.toUpperCase();
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: async (property, tx): Promise<Result<boolean, ChangePropertyCodeError>> => {
        const other = await tx.properties.findByCode(code);
        if (other !== undefined && other.id !== property.id) {
          return err({ type: 'ReferenceCodeTaken' });
        }
        return property.changeCode(code, now);
      },
    });
  }
}

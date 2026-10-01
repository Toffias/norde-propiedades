import { err, type Actor, type Clock, type Result } from '../../../shared';
import { UpdatePropertyDealInputSchema, type UpdatePropertyDealInput } from '../../contracts';
import type { NegativePriceError, PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyDealError = EditPropertyError | PropertyInTrashError | NegativePriceError;

/** Exclusividad, permuta, escritura inmediata, financiación, apto crédito y expensas. */
export class UpdatePropertyDeal {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyDealInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyDealError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyDealInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, expenses, ...flags } = parsed.data;
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: (property) =>
        property.updateDeal(
          {
            isExclusive: flags.isExclusive,
            acceptsSwap: flags.acceptsSwap,
            immediateDeed: flags.immediateDeed,
            hasFinancing: flags.hasFinancing,
            creditEligible: flags.creditEligible,
            expensesCents: expenses,
          },
          now,
        ),
    });
  }
}

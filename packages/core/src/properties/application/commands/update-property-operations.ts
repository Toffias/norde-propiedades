import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyOperationsInputSchema,
  type UpdatePropertyOperationsInput,
} from '../../contracts';
import type {
  InvalidCommissionError,
  InvalidOperationsError,
  NegativePriceError,
  PropertyInTrashError,
} from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyOperationsError =
  | EditPropertyError
  | PropertyInTrashError
  | InvalidOperationsError
  | NegativePriceError
  | InvalidCommissionError;

/**
 * Las operaciones de la propiedad (venta, alquiler, temporario), cada una con precio, moneda,
 * "precio a consultar" y comisión. Cada cambio de precio va al historial de precios y emite
 * `PropertyPriceChanged`.
 */
export class UpdatePropertyOperations {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyOperationsInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyOperationsError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyOperationsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, operations } = parsed.data;
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: (property) =>
        property.setOperations(
          operations.map((operation) => ({
            operation: operation.operation,
            currency: operation.currency,
            priceCents: operation.price,
            priceOnRequest: operation.priceOnRequest,
            commissionPct: operation.commissionPct,
          })),
          now,
        ),
    });
  }
}

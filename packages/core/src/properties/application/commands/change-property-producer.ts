import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  ChangePropertyProducerInputSchema,
  type ChangePropertyProducerInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export interface ProducerNotFoundError {
  readonly type: 'ProducerNotFound';
}

export type ChangePropertyProducerError =
  EditPropertyError | PropertyInTrashError | ProducerNotFoundError;

/**
 * Cambia el captador desde la ficha: requiere `properties:change-producer`, además de poder editar
 * la propiedad. La propiedad pasa a la sucursal del nuevo captador.
 */
export class ChangePropertyProducer {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly producers: Producers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ChangePropertyProducerInput,
    actor: Actor,
  ): Promise<Result<void, ChangePropertyProducerError>> {
    if (!canEditProperties(actor) || !actor.can('properties:change-producer')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ChangePropertyProducerInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, userId } = parsed.data;
    const producer = await this.deps.producers.find(userId);
    if (!producer) return err({ type: 'ProducerNotFound' });
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      action: 'property.producer_changed',
      apply: (property) => property.changeProducer({ userId, branchId: producer.branchId }, now),
    });
  }
}

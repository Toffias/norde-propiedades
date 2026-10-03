import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdateDevelopmentDetailsInputSchema,
  type UpdateDevelopmentDetailsInput,
} from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UpdateDevelopmentDetailsError = EditDevelopmentError | DevelopmentInTrashError;

/** Estado de obra, fecha de entrega, descripción, atributos de operación y financiación. */
export class UpdateDevelopmentDetails {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateDevelopmentDetailsInput,
    actor: Actor,
  ): Promise<Result<void, UpdateDevelopmentDetailsError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateDevelopmentDetailsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, data.developmentId, {
      apply: (development) =>
        development.updateDetails(
          {
            constructionStatus: data.constructionStatus,
            deliveryDate: data.deliveryDate,
            description: data.description,
            financingDetails: data.financingDetails,
            deal: {
              isFinanced: data.isFinanced,
              acceptsSwap: data.acceptsSwap,
              immediateDeed: data.immediateDeed,
            },
          },
          now,
        ),
    });
  }
}

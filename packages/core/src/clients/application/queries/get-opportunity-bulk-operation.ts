import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetOpportunityBulkOperationInputSchema,
  type GetOpportunityBulkOperationInput,
  type OpportunityBulkOperationView,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { canReadOpportunities } from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type GetOpportunityBulkOperationError =
  ForbiddenError | InvalidInputError | { readonly type: 'BulkOperationNotFound' };

/** Cómo va una acción masiva encolada. La sigue quien la pidió. */
export class GetOpportunityBulkOperation {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: GetOpportunityBulkOperationInput,
    actor: Actor,
  ): Promise<Result<OpportunityBulkOperationView, GetOpportunityBulkOperationError>> {
    if (!canReadOpportunities(actor)) return err({ type: 'Forbidden' });
    const parsed = GetOpportunityBulkOperationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = parseId<'OpportunityBulkOperation'>(parsed.data.operationId);
    if (id.isErr()) return err({ type: 'BulkOperationNotFound' });

    const operation = await this.deps.uow.run((tx) => tx.bulkOperations.findById(id.value));
    if (operation?.requestedBy !== actor.id) return err({ type: 'BulkOperationNotFound' });
    const s = operation.toSnapshot();
    return ok({ id: s.id, status: s.status, result: s.totals, failure: s.failure });
  }
}

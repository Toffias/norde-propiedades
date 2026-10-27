import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { FindReceivedInquiriesInputSchema, type FindReceivedInquiriesInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type FindReceivedInquiriesError = ForbiddenError | InvalidInputError;

/**
 * De esos IDs externos de un canal, los que ya entraron a la bandeja (incluidas las borradas). Los
 * procesos que leen un portal lo usan para no pedir el detalle de un contacto que ya tienen.
 */
export class FindReceivedInquiries {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: FindReceivedInquiriesInput,
    actor: Actor,
  ): Promise<Result<readonly string[], FindReceivedInquiriesError>> {
    if (actor.kind !== 'system' || !actor.can('inquiries:receive')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = FindReceivedInquiriesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { channel, externalIds } = parsed.data;
    if (externalIds.length === 0) return ok([]);
    return ok(await this.deps.uow.run((tx) => tx.inquiries.findReceived(channel, externalIds)));
  }
}

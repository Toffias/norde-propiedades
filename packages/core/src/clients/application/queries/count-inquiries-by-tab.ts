import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  CountInquiriesByTabQuerySchema,
  type CountInquiriesByTabQuery,
  type InquiryTabCounts,
} from '../../contracts';
import { dayRange, invalidInput, type InvalidInputError } from '../client-support';
import { canReadInquiries } from '../inquiry-support';
import type { InquiryInboxQuery } from '../ports/inquiry-inbox-query';

export type CountInquiriesByTabError = ForbiddenError | InvalidInputError;

/**
 * Los totales de Pendientes, Asignadas y Borradas con los filtros de la bandeja: las tarjetas que
 * también sirven para cambiar de pestaña.
 */
export class CountInquiriesByTab {
  constructor(private readonly deps: { readonly inbox: InquiryInboxQuery }) {}

  async execute(
    input: CountInquiriesByTabQuery,
    actor: Actor,
  ): Promise<Result<InquiryTabCounts, CountInquiriesByTabError>> {
    if (!canReadInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = CountInquiriesByTabQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { branchId, channel, propertyId, receivedFrom, receivedTo } = parsed.data;

    return ok(
      await this.deps.inbox.countByTab({
        branchId,
        channel,
        propertyId: propertyId?.toLowerCase(),
        received: dayRange(receivedFrom, receivedTo),
      }),
    );
  }
}

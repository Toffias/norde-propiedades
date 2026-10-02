import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { InquiryIdInputSchema, type InquiryIdInput } from '../../contracts';
import type { InquiryAlreadyDeletedError } from '../../domain/inquiry';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  canManageInquiries,
  findInquiry,
  inquiryTarget,
  type InquiryNotFoundError,
} from '../inquiry-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type DeleteInquiryError =
  ForbiddenError | InvalidInputError | InquiryNotFoundError | InquiryAlreadyDeletedError;

/** Manda una consulta a "Borradas" ("Administrar consultas"). Se restaura desde ahí. */
export class DeleteInquiry {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: InquiryIdInput, actor: Actor): Promise<Result<void, DeleteInquiryError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = InquiryIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteInquiryError>> => {
      const inquiry = await findInquiry(tx.inquiries, parsed.data.inquiryId);
      if (!inquiry) return err({ type: 'InquiryNotFound' });
      const deleted = inquiry.delete(actor.id, now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.inquiries.save(inquiry, actor.id);
      await tx.events.publish(inquiry.pullEvents());
      await tx.audit.record(auditAction(actor, inquiryTarget('inquiry.deleted', inquiry)));
      return ok(undefined);
    });
  }
}

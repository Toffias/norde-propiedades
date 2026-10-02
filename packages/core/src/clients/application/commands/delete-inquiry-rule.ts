import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { InquiryRuleIdInputSchema, type InquiryRuleIdInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  findRule,
  ruleAuditState,
  ruleTarget,
  type InquiryRuleNotFoundError,
} from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type DeleteInquiryRuleError = ForbiddenError | InvalidInputError | InquiryRuleNotFoundError;

/**
 * Borra una regla (`inquiries:manage`). Las consultas que ya repartió no cambian. Queda en la
 * auditoría con todos sus valores, por si hay que volver a cargarla.
 */
export class DeleteInquiryRule {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: InquiryRuleIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteInquiryRuleError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = InquiryRuleIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteInquiryRuleError>> => {
      const rule = await findRule(tx.inquiryRules, parsed.data.ruleId);
      if (!rule) return err({ type: 'InquiryRuleNotFound' });
      const before = ruleAuditState(rule);
      await tx.inquiryRules.delete(rule.id);
      await tx.audit.record(
        auditAction(actor, ruleTarget('inquiry_rule.deleted', rule.id), diffChanges(before, {})),
      );
      return ok(undefined);
    });
  }
}

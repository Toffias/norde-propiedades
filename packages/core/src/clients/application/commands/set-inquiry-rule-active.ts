import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SetInquiryRuleActiveInputSchema, type SetInquiryRuleActiveInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { findRule, ruleTarget, type InquiryRuleNotFoundError } from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type SetInquiryRuleActiveError =
  ForbiddenError | InvalidInputError | InquiryRuleNotFoundError;

/**
 * Activa o inactiva una regla (`inquiries:manage`). Una inactiva no toma consultas, pero conserva
 * su prioridad y su reparto.
 */
export class SetInquiryRuleActive {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SetInquiryRuleActiveInput,
    actor: Actor,
  ): Promise<Result<void, SetInquiryRuleActiveError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = SetInquiryRuleActiveInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { ruleId, active } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetInquiryRuleActiveError>> => {
      const rule = await findRule(tx.inquiryRules, ruleId);
      if (!rule) return err({ type: 'InquiryRuleNotFound' });
      if (!rule.setActive(active, now)) return ok(undefined);

      await tx.inquiryRules.save(rule, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          ruleTarget(active ? 'inquiry_rule.activated' : 'inquiry_rule.deactivated', rule.id),
        ),
      );
      return ok(undefined);
    });
  }
}

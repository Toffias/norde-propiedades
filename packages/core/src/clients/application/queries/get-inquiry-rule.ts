import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  InquiryRuleIdInputSchema,
  type InquiryRuleIdInput,
  type InquiryRuleRow,
} from '../../contracts';
import { byPriority } from '../../domain/inquiry-assignment-rule';
import { invalidInput, type InvalidInputError } from '../client-support';
import { findRule, toRuleRows, type InquiryRuleNotFoundError } from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { ClientListings } from '../ports/client-record-query';

export type GetInquiryRuleError = ForbiddenError | InvalidInputError | InquiryRuleNotFoundError;

/** Una regla con todo lo suyo, para editarla en el asistente (`inquiries:manage`). */
export class GetInquiryRule {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly listings: ClientListings;
    },
  ) {}

  async execute(
    input: InquiryRuleIdInput,
    actor: Actor,
  ): Promise<Result<InquiryRuleRow, GetInquiryRuleError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = InquiryRuleIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const found = await this.deps.uow.run(async (tx) => {
      const rule = await findRule(tx.inquiryRules, parsed.data.ruleId);
      if (!rule) return undefined;
      // Su lugar en la prioridad, entre las de su pestaña (como mucho `MAX_INQUIRY_RULES`).
      const tab = (await tx.inquiryRules.findAll())
        .filter((r) => r.isActive === rule.isActive)
        .sort(byPriority);
      return {
        rule: rule.toSnapshot(),
        priority: tab.findIndex((r) => r.id === rule.id) + 1,
        total: tab.length,
      };
    });
    if (!found) return err({ type: 'InquiryRuleNotFound' });

    const [row] = await toRuleRows([found], found.total, this.deps, actor);
    if (!row) throw new Error(`Inquiry rule ${found.rule.id} could not be shown`);
    return ok(row);
  }
}

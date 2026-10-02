import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateInquiryRuleInputSchema, type UpdateInquiryRuleInput } from '../../contracts';
import type { InvalidInquiryRuleError } from '../../domain/inquiry-assignment-rule';
import { invalidInput, type AgentNotFoundError, type InvalidInputError } from '../client-support';
import {
  checkRuleAgents,
  findRule,
  ruleAuditState,
  ruleTarget,
  type InquiryRuleNotFoundError,
} from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UpdateInquiryRuleError =
  | ForbiddenError
  | InvalidInputError
  | InquiryRuleNotFoundError
  | InvalidInquiryRuleError
  | AgentNotFoundError;

/**
 * Edita el nombre, las condiciones y los agentes de una regla (`inquiries:manage`). Si cambian los
 * agentes o sus pesos, el reparto arranca de cero.
 */
export class UpdateInquiryRule {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdateInquiryRuleInput,
    actor: Actor,
  ): Promise<Result<void, UpdateInquiryRuleError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = UpdateInquiryRuleInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const missing = await checkRuleAgents(this.deps.agents, data.agents);
    if (missing) return err(missing);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateInquiryRuleError>> => {
      const rule = await findRule(tx.inquiryRules, data.ruleId);
      if (!rule) return err({ type: 'InquiryRuleNotFound' });
      const before = ruleAuditState(rule);
      const changed = rule.edit(
        { name: data.name, conditions: data.conditions, agents: data.agents },
        now,
      );
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.inquiryRules.save(rule, actor.id);
      const entry = auditUpdated(
        actor,
        ruleTarget('inquiry_rule.updated', rule.id),
        before,
        ruleAuditState(rule),
      );
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

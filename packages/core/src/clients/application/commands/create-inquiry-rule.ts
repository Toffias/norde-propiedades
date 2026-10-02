import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  CreateInquiryRuleInputSchema,
  type CreateInquiryRuleInput,
  type CreateInquiryRuleOutput,
} from '../../contracts';
import {
  InquiryAssignmentRule,
  type InvalidInquiryRuleError,
  type TooManyInquiryRulesError,
} from '../../domain/inquiry-assignment-rule';
import { invalidInput, type AgentNotFoundError, type InvalidInputError } from '../client-support';
import { checkRuleAgents, ruleAuditState, ruleTarget } from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CreateInquiryRuleError =
  | ForbiddenError
  | InvalidInputError
  | InvalidInquiryRuleError
  | TooManyInquiryRulesError
  | AgentNotFoundError;

/** Una regla de asignación nueva (`inquiries:manage`): nace activa y última en la prioridad. */
export class CreateInquiryRule {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateInquiryRuleInput,
    actor: Actor,
  ): Promise<Result<CreateInquiryRuleOutput, CreateInquiryRuleError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = CreateInquiryRuleInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const missing = await checkRuleAgents(this.deps.agents, data.agents);
    if (missing) return err(missing);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<CreateInquiryRuleOutput, CreateInquiryRuleError>> => {
        const rules = await tx.inquiryRules.findAll();
        const created = InquiryAssignmentRule.create({
          id: nextId<'InquiryAssignmentRule'>(this.deps.ids),
          name: data.name,
          conditions: data.conditions,
          agents: data.agents,
          existingCount: rules.length,
          nextPosition: Math.max(-1, ...rules.map((r) => r.position)) + 1,
          now,
        });
        if (created.isErr()) return err(created.error);
        const rule = created.value;

        await tx.inquiryRules.save(rule, actor.id);
        await tx.audit.record(
          auditCreated(actor, ruleTarget('inquiry_rule.created', rule.id), ruleAuditState(rule)),
        );
        return ok({ ruleId: rule.id });
      },
    );
  }
}

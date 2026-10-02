import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListInquiryRulesQuerySchema,
  type InquiryRuleRow,
  type ListInquiryRulesQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { toRuleRows } from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListings } from '../ports/client-record-query';
import type { InquiryRuleQuery } from '../ports/inquiry-rule-query';

export type ListInquiryRulesError = ForbiddenError | InvalidInputError;

/** Las reglas activas o las inactivas, por prioridad y paginadas (`inquiries:manage`). */
export class ListInquiryRules {
  constructor(
    private readonly deps: {
      readonly rules: InquiryRuleQuery;
      readonly agents: ClientAgents;
      readonly listings: ClientListings;
    },
  ) {}

  async execute(
    input: ListInquiryRulesQuery,
    actor: Actor,
  ): Promise<Result<Page<InquiryRuleRow>, ListInquiryRulesError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = ListInquiryRulesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, status } = parsed.data;

    const slice = await this.deps.rules.search({
      active: status === 'active',
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toRuleRows(slice.items, slice.total, this.deps, actor);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}

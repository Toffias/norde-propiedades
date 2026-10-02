import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { MoveInquiryRuleInputSchema, type MoveInquiryRuleInput } from '../../contracts';
import { byPriority } from '../../domain/inquiry-assignment-rule';
import { invalidInput, type InvalidInputError } from '../client-support';
import { findRule, ruleTarget, type InquiryRuleNotFoundError } from '../inquiry-rule-support';
import { canManageInquiries } from '../inquiry-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type MoveInquiryRuleError = ForbiddenError | InvalidInputError | InquiryRuleNotFoundError;

/**
 * Sube o baja una regla un lugar en la prioridad (`inquiries:manage`): cambia su posición con la de
 * al lado entre las de su pestaña (activas o inactivas). La primera no sube y la última no baja.
 */
export class MoveInquiryRule {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: MoveInquiryRuleInput,
    actor: Actor,
  ): Promise<Result<void, MoveInquiryRuleError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = MoveInquiryRuleInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { ruleId, direction } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, MoveInquiryRuleError>> => {
      const rule = await findRule(tx.inquiryRules, ruleId);
      if (!rule) return err({ type: 'InquiryRuleNotFound' });
      const tab = (await tx.inquiryRules.findAll())
        .filter((r) => r.isActive === rule.isActive)
        .sort(byPriority);
      const index = tab.findIndex((r) => r.id === rule.id);
      const current = tab[index];
      const other = tab[direction === 'up' ? index - 1 : index + 1];
      if (!current || !other) return ok(undefined);

      const from = current.position;
      const to = other.position;
      // Dos reglas con la misma posición (creadas a la vez) se separan al moverlas.
      current.moveTo(from === to ? (direction === 'up' ? to - 1 : to + 1) : to, now);
      other.moveTo(from, now);
      await tx.inquiryRules.save(current, actor.id);
      await tx.inquiryRules.save(other, actor.id);
      await tx.audit.record(
        auditAction(actor, ruleTarget('inquiry_rule.moved', current.id), {
          position: { before: from, after: current.position },
        }),
      );
      return ok(undefined);
    });
  }
}

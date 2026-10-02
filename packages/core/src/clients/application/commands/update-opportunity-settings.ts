import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  UpdateOpportunitySettingsInputSchema,
  type UpdateOpportunitySettingsInput,
} from '../../contracts';
import {
  checkRules,
  type InvalidRuleStageError,
  type OpportunityRules,
} from '../../domain/opportunity-settings';
import type { OpportunityStageId } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import { configTarget, rulesAuditState } from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { idOf } from '../tag-support';

export type UpdateOpportunitySettingsError =
  ForbiddenError | InvalidInputError | InvalidRuleStageError;

const SETTINGS_ID = 'opportunity_settings';

/** Cambia el estado que aplica cada regla automática. */
export class UpdateOpportunitySettings {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateOpportunitySettingsInput,
    actor: Actor,
  ): Promise<Result<void, UpdateOpportunitySettingsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateOpportunitySettingsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const pick = (raw: string | null): OpportunityStageId | undefined =>
      raw === null ? undefined : idOf<'OpportunityStage'>(raw);
    const requested: OpportunityRules = {
      onCreate: pick(parsed.data.onCreate),
      onAssign: pick(parsed.data.onAssign),
      onReactivate: pick(parsed.data.onReactivate),
      forOwners: pick(parsed.data.forOwners),
    };
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateOpportunitySettingsError>> => {
      const rules = checkRules(requested, await tx.stages.findAll());
      if (rules.isErr()) return err(rules.error);

      const before = rulesAuditState(await tx.opportunitySettings.get());
      const entry = auditUpdated(
        actor,
        configTarget('opportunity_settings', 'opportunity_settings.updated', SETTINGS_ID),
        before,
        rulesAuditState(rules.value),
      );
      if (!entry) return ok(undefined);

      await tx.opportunitySettings.save(rules.value, actor.id, now);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}

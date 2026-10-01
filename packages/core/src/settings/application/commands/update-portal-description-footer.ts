import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  UpdatePortalDescriptionFooterInputSchema,
  type UpdatePortalDescriptionFooterInput,
} from '../../contracts';
import {
  DescriptionFooterTemplate,
  type InvalidFooterTemplateError,
} from '../../domain/description-footer-template';
import { companySettingsAuditState, saveCompanySettingsChange } from '../company-settings-changes';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UpdatePortalDescriptionFooterError =
  ForbiddenError | ValidationFailedError | InvalidFooterTemplateError;

/** Pie que se agrega a la descripción de las propiedades publicadas en portales. Vacío lo quita. */
export class UpdatePortalDescriptionFooter {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdatePortalDescriptionFooterInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePortalDescriptionFooterError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UpdatePortalDescriptionFooterInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    const raw = parsed.value.footer;
    let footer: DescriptionFooterTemplate | undefined;
    if (raw !== undefined && raw !== '') {
      const created = DescriptionFooterTemplate.create(raw);
      if (created.isErr()) return err(created.error);
      footer = created.value;
    }

    return this.deps.uow.run(
      async (tx): Promise<Result<void, UpdatePortalDescriptionFooterError>> => {
        const settings = await tx.companySettings.get();
        const before = companySettingsAuditState(settings);
        settings.changePortalDescriptionFooter(footer, this.deps.clock.now());
        await saveCompanySettingsChange(tx, actor, settings, before);
        return ok(undefined);
      },
    );
  }
}
